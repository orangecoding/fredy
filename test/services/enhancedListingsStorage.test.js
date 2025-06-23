import { expect } from 'chai';
import * as enhancedListingsStorage from '../../lib/services/storage/enhancedListingsStorage.js';
import { JSONFileSync } from 'lowdb/node';
import path from 'path';
import { getDirName } from '../../lib/utils/utils.js';
import fs from 'fs';
import esmock from 'esmock';

describe('EnhancedListingsStorage', () => {
  let storage;
  const testJobId = 'test-job-123';
  const testEnhancedListingsArr = [
    {
      id: '1',
      url: 'https://example.com/1',
      title: 'Test Listing 1',
      price: 1000,
      size: 80,
      rooms: 3,
      link: 'https://example.com/1',
      date_found: 1234567890,
      details: 'Test details 1'
    },
    {
      id: '2',
      url: 'https://example.com/2',
      title: 'Test Listing 2',
      price: 2000,
      size: 120,
      rooms: 4,
      link: 'https://example.com/2',
      date_found: 1234567891,
      details: 'Test details 2'
    }
  ];
  const testEnhancedListingsObj = {
    '1': testEnhancedListingsArr[0],
    '2': testEnhancedListingsArr[1]
  };

  const mockJob = {
    id: testJobId,
    name: 'Test Job',
    customFields: [],
    waypoints: []
  };

  before(async () => {
    storage = await esmock('../../lib/services/storage/enhancedListingsStorage.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: (jobId) => jobId === testJobId ? mockJob : null
      }
    });
  });

  beforeEach(() => {
    // Initialize storage for test job
    storage.init(testJobId);
  });

  afterEach(() => {
    // Clean up test data
    storage.deleteJobFile(testJobId);
  });

  describe('init', () => {
    it('should initialize storage for a job', () => {
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.be.an('array');
      expect(enhancedListings).to.be.empty;
    });
  });

  describe('addListings', () => {
    it('should add new enhanced listings to storage (array)', () => {
      storage.addListings(testJobId, testEnhancedListingsArr);
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
      expect(enhancedListings[0].title).to.equal('Test Listing 1');
      expect(enhancedListings[1].title).to.equal('Test Listing 2');
    });

    it('should add new enhanced listings to storage (object)', () => {
      storage.addListings(testJobId, testEnhancedListingsObj);
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
      expect(enhancedListings.find(l => l.id === '1').title).to.equal('Test Listing 1');
      expect(enhancedListings.find(l => l.id === '2').title).to.equal('Test Listing 2');
    });

    it('should not add duplicate enhanced listings based on ID', () => {
      storage.addListings(testJobId, testEnhancedListingsArr);
      // Try to add the same listings again
      storage.addListings(testJobId, testEnhancedListingsArr);
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
    });

    it('should add only new enhanced listings when some already exist', () => {
      storage.addListings(testJobId, [testEnhancedListingsArr[0]]);
      storage.addListings(testJobId, testEnhancedListingsArr);
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
    });
  });

  describe('getListings', () => {
    it('should return empty array for non-existent job', () => {
      const enhancedListings = storage.getListings('non-existent-job');
      expect(enhancedListings).to.be.an('array');
      expect(enhancedListings).to.be.empty;
    });

    it('should return all enhanced listings for a job', () => {
      storage.addListings(testJobId, testEnhancedListingsArr);
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
      expect(enhancedListings.find(l => l.id === '1').title).to.equal('Test Listing 1');
      expect(enhancedListings.find(l => l.id === '2').title).to.equal('Test Listing 2');
    });
  });

  describe('getListingByUrl', () => {
    it('should return null for non-existent URL', () => {
      const enhancedListing = storage.getListingByUrl(testJobId, 'https://example.com/non-existent');
      expect(enhancedListing).to.be.null;
    });

    it('should return enhanced listing by URL', () => {
      storage.addListings(testJobId, testEnhancedListingsArr);
      const enhancedListing = storage.getListingByUrl(testJobId, 'https://example.com/1');
      expect(enhancedListing).to.deep.equal(testEnhancedListingsArr[0]);
    });
  });

  describe('deleteAllListings', () => {
    it('should remove all enhanced listings for a job', () => {
      storage.addListings(testJobId, testEnhancedListingsArr);
      storage.deleteAllListings(testJobId);
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.be.empty;
    });
  });

  describe('deleteJobFile', () => {
    it('should delete the job file completely', () => {
      // Add some data first
      storage.addListings(testJobId, testEnhancedListingsArr);
      
      // Delete the file
      storage.deleteJobFile(testJobId);
      
      // Verify file is gone
      const filePath = path.join(getDirName(), '../', 'db/enhanced-listings', `${testJobId}.json`);
      expect(fs.existsSync(filePath)).to.be.false;
      
      // Verify we get empty array when trying to access deleted file
      const enhancedListings = storage.getListings(testJobId);
      expect(enhancedListings).to.be.an('array');
      expect(enhancedListings).to.be.empty;
    });
  });
});

const TEST_JOB_ID = 'test-job-enhanced';
const DB_PATH = path.join(path.dirname(import.meta.url.replace('file://', '')), '../../db/enhanced-listings', `${TEST_JOB_ID}.json`);

describe('enhancedListingsStorage full flow', () => {
  const job = {
    id: TEST_JOB_ID,
    customFields: [
      { id: 'custom1', name: 'custom1' },
      { id: 'custom2', name: 'custom2' }
    ],
    waypoints: [
      { id: '1', name: 'Work', location: 'Work Address', transportMode: 'transit' },
      { id: '2', name: 'Gym', location: 'Gym Address', transportMode: 'bicycling' }
    ]
  };

  const listings = [
    {
      id: 'l1',
      title: 'Listing 1',
      price: 1000,
      size: 50,
      link: 'http://example.com/1',
      date_found: 123456,
      details: 'Details 1',
      custom1: 'foo',
      custom2: 'bar',
      travelTime_1: '20 min',
      travelDistance_1: '10 km',
      travelTime_2: '30 min',
      travelDistance_2: '15 km'
    },
    {
      id: 'l2',
      title: 'Listing 2',
      price: 2000,
      size: 70,
      link: 'http://example.com/2',
      date_found: 123457,
      details: 'Details 2',
      custom1: 'baz',
      custom2: 'qux',
      travelTime_1: '25 min',
      travelDistance_1: '12 km',
      travelTime_2: '35 min',
      travelDistance_2: '18 km'
    }
  ];

  before(() => {
    // Clean up any previous test data
    enhancedListingsStorage.deleteJobFile(TEST_JOB_ID);
  });

  after(() => {
    // Clean up after tests
    enhancedListingsStorage.deleteJobFile(TEST_JOB_ID);
  });

  it('should enhance listings, write to db, and verify format', () => {
    // Generate schema and write to db
    const schema = enhancedListingsStorage.generateSchemaFromJobConfig(job, true);
    enhancedListingsStorage.addListings(TEST_JOB_ID, listings);
    const stored = enhancedListingsStorage.getListings(TEST_JOB_ID);
    // All listings should have all schema columns
    schema.forEach(col => {
      stored.forEach(listing => {
        expect(listing).to.have.property(col.id);
      });
    });
    // Check a few values
    expect(stored[0].custom1).to.equal('foo');
    expect(stored[1].travelTime_2).to.equal('35 min');
  });

  it('should add and delete columns, backfill and remove in all listings', () => {
    // Add a new custom field
    enhancedListingsStorage.addOrUpdateColumns(TEST_JOB_ID, [{ id: 'custom3', display_name: 'Custom 3', type: 'custom' }]);
    let schema = enhancedListingsStorage.getSchema(TEST_JOB_ID);
    let stored = enhancedListingsStorage.getListings(TEST_JOB_ID);
    // All listings should have custom3 (backfilled as empty string)
    stored.forEach(listing => {
      expect(listing).to.have.property('custom3');
      expect(listing.custom3).to.equal('');
    });
    // Delete custom1
    enhancedListingsStorage.deleteColumns(TEST_JOB_ID, ['custom1']);
    schema = enhancedListingsStorage.getSchema(TEST_JOB_ID);
    stored = enhancedListingsStorage.getListings(TEST_JOB_ID);
    // All listings should NOT have custom1
    stored.forEach(listing => {
      expect(listing).to.not.have.property('custom1');
    });
    // Schema should not have custom1
    expect(schema.find(col => col.id === 'custom1')).to.be.undefined;
  });
}); 