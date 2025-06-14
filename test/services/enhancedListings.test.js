import { expect } from 'chai';
import { mockFredy } from '../utils.js';
import * as providerImmoWelt from '../../lib/provider/immowelt.js';
import * as providerKleinanzeigen from '../../lib/provider/kleinanzeigen.js';
import * as providerWGesucht from '../../lib/provider/wgGesucht.js';
import * as providerImmoScout from '../../lib/provider/immoscout.js';
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

describe('Enhanced Listings Integration Tests', () => {
  let Fredy;
  const jobKey = "test-job";
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
      apiKey: userConfig.chatgpt?.apiKey || "sk-test"
    }
  };

  before(async () => {
    const { default: ExposeExtractor } = await esmock('../../lib/services/extractor/exposeExtractor.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: () => ({ customFields })
      }
    });

    const { default: ChatGPTExtractor } = await esmock('../../lib/services/extractor/prompter/chatgpt.js', {
      '../../lib/utils.js': {
        config: mockConfig
      }
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
  });

  after(() => {
    similarityCache.stopCacheCleanup();
  });

  describe('ImmoScout', () => {
    before(() => {
      providerImmoScout.init({
        enabled: true,
        url: "https://www.immobilienscout24.de/Suche/de/berlin/berlin/wohnung-mieten",
        blacklist: []
      }, []);
    });

    it('should enhance an ImmoScout listing with expected fields and custom highlight', async () => {
      const mockListing = {
        id: "158382494",
        title: "Ruhiges Wohnen im Grunewald nahe Roseneck mit teilgewerblicher Nutzung",
        link: "https://www.immobilienscout24.de/expose/158382494",
        price: "3.200 €",
        size: "130,29 m²",
        address: "Dünkelbergsteig 11 14195 Schmargendorf, Berlin"
      };

      const fredy = new Fredy(
        providerImmoScout.config,
        null,
        providerImmoScout.metaInformation.id,
        jobKey,
        similarityCache
      );

      const enhancedListings = await fredy._enhanceListings([mockListing]);
      expect(enhancedListings).to.be.an('array').with.lengthOf(1);

      const enhancedData = enhancedListings[0];
      expect(enhancedData.id).to.equal(mockListing.id);
      expect(enhancedData.title).to.equal(mockListing.title);

      // Verify enhanced data is present
      expect(enhancedData).to.have.property('rooms');
      expect(enhancedData).to.have.property('area');
      expect(enhancedData).to.have.property('address');
      expect(enhancedData).to.have.property('baseRent');
      expect(enhancedData).to.have.property('bathrooms');
      expect(enhancedData).to.have.property('bedrooms');
      expect(enhancedData).to.have.property('moveInDate');
      expect(enhancedData.highlight).to.be.a('string');

      expect(enhancedData.link).to.equal(mockListing.link);
      expect(enhancedData.price).to.equal(mockListing.price);
      expect(enhancedData.address).to.equal(mockListing.address);
    });
  });

  describe('WG-Gesucht', () => {
    before(() => {
      providerWGesucht.init({
        enabled: true,
        url: "https://www.wg-gesucht.de/wohnungen-in-Berlin.8.0.0.0.html",
        blacklist: []
      }, []);
    });

    it('should enhance a WG-Gesucht listing with expected fields and custom highlight', async () => {
      const mockListing = {
        id: "12085625",
        title: "Modernisierte 5-Zimmer-Altbauwohnung in Steglitz",
        link: "https://www.wg-gesucht.de/wohnungen-in-Berlin-Steglitz.12085625.html",
        price: "3435€",
        size: "158 m²",
        address: "Leydenallee, 12167 Berlin Steglitz"
      };

      const fredy = new Fredy(
        providerWGesucht.config,
        null,
        providerWGesucht.metaInformation.id,
        jobKey,
        similarityCache
      );

      const enhancedListings = await fredy._enhanceListings([mockListing]);
      expect(enhancedListings).to.be.an('array').with.lengthOf(1);

      const enhancedData = enhancedListings[0];
      expect(enhancedData.id).to.equal(mockListing.id);
      expect(enhancedData.title).to.equal(mockListing.title);

      // Verify enhanced data is present
      expect(enhancedData).to.have.property('rooms');
      expect(enhancedData).to.have.property('area');
      expect(enhancedData).to.have.property('address');
      expect(enhancedData).to.have.property('baseRent');
      expect(enhancedData).to.have.property('bathrooms');
      expect(enhancedData).to.have.property('bedrooms');
      expect(enhancedData).to.have.property('moveInDate');
      expect(enhancedData.highlight).to.be.a('string');

      expect(enhancedData.link).to.equal(mockListing.link);
      expect(enhancedData.price).to.equal(mockListing.price);
      expect(enhancedData.address).to.equal(mockListing.address);
    });
  });

  describe('Kleinanzeigen', () => {
    before(() => {
      providerKleinanzeigen.init({
        enabled: true,
        url: "https://www.kleinanzeigen.de/s-wohnung-mieten/berlin",
        blacklist: []
      }, []);
    });

    it('should enhance a Kleinanzeigen listing with expected fields and custom highlight', async () => {
      const mockListing = {
        id: "3027596196",
        title: "Exklusive Wohlfühloase im Herzen Berlins – Ihre Traumwohnung mit Sauna in Wilmersdorf!",
        link: "https://www.kleinanzeigen.de/s-anzeige/3027596196",
        price: "3.750 €",
        size: "190 m²",
        address: "10715 Berlin - Wilmersdorf"
      };

      const fredy = new Fredy(
        providerKleinanzeigen.config,
        null,
        providerKleinanzeigen.metaInformation.id,
        jobKey,
        similarityCache
      );

      const enhancedListings = await fredy._enhanceListings([mockListing]);
      expect(enhancedListings).to.be.an('array').with.lengthOf(1);

      const enhancedData = enhancedListings[0];
      expect(enhancedData.id).to.equal(mockListing.id);
      expect(enhancedData.title).to.equal(mockListing.title);

      // Verify enhanced data is present
      expect(enhancedData).to.have.property('rooms');
      expect(enhancedData).to.have.property('area');
      expect(enhancedData).to.have.property('address');
      expect(enhancedData).to.have.property('baseRent');
      expect(enhancedData).to.have.property('bathrooms');
      expect(enhancedData).to.have.property('bedrooms');
      expect(enhancedData).to.have.property('moveInDate');
      expect(enhancedData.highlight).to.be.a('string');

      expect(enhancedData.link).to.equal(mockListing.link);
      expect(enhancedData.price).to.equal(mockListing.price);
      expect(enhancedData.address).to.equal(mockListing.address);
    });
  });

  describe('Immowelt', () => {
    before(() => {
      providerImmoWelt.init({
        enabled: true,
        url: "https://www.immowelt.de/liste/berlin/wohnungen/mieten",
        blacklist: []
      }, []);
    });

    it('should enhance an Immowelt listing with expected fields and custom highlight', async () => {
      const mockListing = {
        id: "fbff63bf-ef04-4ba5-9eec-670e2f976afa",
        title: "Moderne 3-Zimmer-Wohnung mit Balkon",
        link: "https://www.immowelt.de/expose/fbff63bf-ef04-4ba5-9eec-670e2f976afa?m=classified_detail_similars_bottom_classified_detail",
        price: "2.518 €",
        size: "93,8 m²",
        address: "Beispielstraße 1, 12345 Berlin"
      };

      const fredy = new Fredy(
        providerImmoWelt.config,
        null,
        providerImmoWelt.metaInformation.id,
        jobKey,
        similarityCache
      );

      const enhancedListings = await fredy._enhanceListings([mockListing]);
      expect(enhancedListings).to.be.an('array').with.lengthOf(1);

      const enhancedData = enhancedListings[0];
      expect(enhancedData.id).to.equal(mockListing.id);
      expect(enhancedData.title).to.equal(mockListing.title);

      // Verify enhanced data is present
      expect(enhancedData).to.have.property('rooms');
      expect(enhancedData).to.have.property('area');
      expect(enhancedData).to.have.property('address');
      expect(enhancedData).to.have.property('baseRent');
      expect(enhancedData).to.have.property('bathrooms');
      expect(enhancedData).to.have.property('bedrooms');
      expect(enhancedData).to.have.property('moveInDate');
      expect(enhancedData).to.have.property('rooms');

      // Check enhanced fields
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
}); 