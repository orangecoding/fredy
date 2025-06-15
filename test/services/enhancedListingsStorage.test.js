import { expect } from 'chai';
import * as enhancedListingsStorage from '../../lib/services/storage/enhancedListingsStorage.js';
import { JSONFileSync } from 'lowdb/node';
import path from 'path';
import { getDirName } from '../../lib/utils.js';
import fs from 'fs';

describe('EnhancedListingsStorage', () => {
  const testJobId = 'test-job-123';
  const testEnhancedListings = [
    {
      id: '1',
      url: 'https://example.com/1',
      title: 'Test Listing 1',
      price: 1000,
      size: 80,
      rooms: 3
    },
    {
      id: '2',
      url: 'https://example.com/2',
      title: 'Test Listing 2',
      price: 2000,
      size: 120,
      rooms: 4
    }
  ];

  beforeEach(() => {
    // Initialize storage for test job
    xenhancedListingsStorage.init(testJobId);
  });

  afterEach(() => {
    // Clean up test data
    enhancedListingsStorage.deleteJobFile(testJobId);
  });

  describe('init', () => {
    it('should initialize storage for a job', () => {
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.be.an('array');
      expect(enhancedListings).to.be.empty;
    });
  });

  describe('addListings', () => {
    it('should add new enhanced listings to storage', () => {
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
      expect(enhancedListings[0].title).to.equal('Test Listing 1');
      expect(enhancedListings[1].title).to.equal('Test Listing 2');
    });

    it('should not add duplicate enhanced listings based on URL', () => {
      // Add listings first time
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      
      // Try to add the same listings again
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
    });

    it('should add only new enhanced listings when some already exist', () => {
      // Add first listing
      enhancedListingsStorage.addListings(testJobId, [testEnhancedListings[0]]);
      
      // Add both listings
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
    });
  });

  describe('getListings', () => {
    it('should return empty array for non-existent job', () => {
      const enhancedListings = enhancedListingsStorage.getListings('non-existent-job');
      expect(enhancedListings).to.be.an('array');
      expect(enhancedListings).to.be.empty;
    });

    it('should return all enhanced listings for a job', () => {
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.have.lengthOf(2);
      expect(enhancedListings).to.deep.equal(testEnhancedListings);
    });
  });

  describe('getListingByUrl', () => {
    it('should return null for non-existent URL', () => {
      const enhancedListing = enhancedListingsStorage.getListingByUrl(testJobId, 'https://example.com/non-existent');
      expect(enhancedListing).to.be.null;
    });

    it('should return enhanced listing by URL', () => {
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      const enhancedListing = enhancedListingsStorage.getListingByUrl(testJobId, 'https://example.com/1');
      expect(enhancedListing).to.deep.equal(testEnhancedListings[0]);
    });
  });

  describe('deleteAllListings', () => {
    it('should remove all enhanced listings for a job', () => {
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      enhancedListingsStorage.deleteAllListings(testJobId);
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.be.empty;
    });
  });

  describe('deleteJobFile', () => {
    it('should delete the job file completely', () => {
      // Add some data first
      enhancedListingsStorage.addListings(testJobId, testEnhancedListings);
      
      // Delete the file
      enhancedListingsStorage.deleteJobFile(testJobId);
      
      // Verify file is gone
      const filePath = path.join(getDirName(), '../', 'db/enhanced-listings', `${testJobId}.json`);
      expect(fs.existsSync(filePath)).to.be.false;
      
      // Verify we get empty array when trying to access deleted file
      const enhancedListings = enhancedListingsStorage.getListings(testJobId);
      expect(enhancedListings).to.be.an('array');
      expect(enhancedListings).to.be.empty;
    });
  });
}); 