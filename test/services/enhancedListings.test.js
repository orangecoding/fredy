import { expect } from 'chai';
import { mockFredy } from '../utils.js';
import * as provider from '../../lib/provider/immowelt.js';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import esmock from 'esmock';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try to read API key from user's config
let userConfig = {};
try {
  const configPath = path.join(__dirname, '../../config.json');
  const configContent = await readFile(configPath, 'utf8');
  userConfig = JSON.parse(configContent);
} catch (error) {
  console.log('No user config found, using test API key');
}

// Patch fetch globally for OpenAI API mocking
if (!global.fetch) {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              floor: "1st floor",
              rent: "2.518 €",
              rooms: "3",
              area: "93.8 m²",
              availableFrom: "01.10.2025",
              highlight: "The highlight is the modern balcony with a great view."
            })
          }
        }
      ]
    })
  });
}

describe('Immowelt enhanceListings integration', () => {
  let Fredy;
  const mockListing = {
    id: "fbff63bf-ef04-4ba5-9eec-670e2f976afa",
    title: "Moderne 3-Zimmer-Wohnung mit Balkon",
    link: "https://www.immowelt.de/expose/fbff63bf-ef04-4ba5-9eec-670e2f976afa?m=classified_detail_similars_bottom_classified_detail",
    price: "2.518 €",
    size: "93.8 m²",
    address: "Beispielstraße 1, 12345 Berlin"
  };
  const jobKey = "test-job-immowelt";
  const customFields = [
    {
      name: "highlight",
      questionPrompt: "What is the highlight of the apartment?",
      answerLength: "one statement"
    }
  ];

  const mockConfig = {
    chatgpt: {
      enabled: true,
      apiKey: userConfig.chatgpt?.apiKey || "sk-test" // Use user's API key if available, otherwise use test key
    }
  };

  before(async () => {
    const { default: ExposeExtractor } = await esmock('../../lib/services/extractor/exposeExtractor.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: () => ({ customFields })
      },
      '../../lib/services/extractor/prompter/chatgpt.js': await esmock('../../lib/services/extractor/prompter/chatgpt.js', {
        '../../lib/utils.js': {
          config: mockConfig
        }
      })
    });

    Fredy = await esmock('../../lib/FredyRuntime.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: () => ({ customFields })
      },
      '../../lib/services/storage/listingsStorage.js': {
        // ...mock as needed
      },
      '../../lib/notification/notify.js': {
        send: () => []
      },
      '../../lib/utils.js': {
        config: mockConfig
      },
      '../../lib/services/extractor/exposeExtractor.js': { default: ExposeExtractor }
    });
    provider.init({
      enabled: true,
      url: "https://www.immowelt.de/liste/berlin/wohnungen/mieten",
      blacklist: []
    }, []);
  });

  after(() => {
    similarityCache.stopCacheCleanup();
  });

  it('should enhance an Immowelt listing with expected fields and custom highlight', async () => {
    const fredy = new Fredy(
      provider.config,
      null,
      provider.metaInformation.id,
      jobKey,
      similarityCache
    );

    const enhancedListings = await fredy._enhanceListings([mockListing]);
    console.log(enhancedListings);
    expect(enhancedListings).to.be.an('array').with.lengthOf(1);

    const enhancedData = enhancedListings[0];
    expect(enhancedData.id).to.equal(mockListing.id);
    expect(enhancedData.title).to.equal(mockListing.title);

    // Verify enhanced data is present // Verify specific enhanced fields based on the listing
    expect(enhancedData).to.have.property('rooms');
    expect(enhancedData).to.have.property('area');
    expect(enhancedData).to.have.property('address');
    expect(enhancedData).to.have.property('baseRent');
    expect(enhancedData).to.have.property('bathrooms');
    expect(enhancedData).to.have.property('bedrooms');
    expect(enhancedData).to.have.property('moveInDate');
    expect(enhancedData).to.have.property('rooms');

    // Check enhanced fds
    expect(enhancedData.floor).to.equal("1");
    expect(enhancedData.baseRent).to.equal("2518");
    expect(enhancedData.rooms).to.equal("3");
    expect(enhancedData.area).to.equal("93,8");
    expect(enhancedData.moveInDate).to.equal("01.10.2025");
    expect(enhancedData.highlight).to.be.a('string');
    
    expect(enhancedData.link).to.equal(mockListing.link);
    expect(enhancedData.price).to.equal(mockListing.price);
    expect(enhancedData.address).to.equal(mockListing.address);
    
  });
}); 