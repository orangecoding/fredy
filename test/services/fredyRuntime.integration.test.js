import { expect } from 'chai';
import esmock from 'esmock';

const TEST_JOB_ID = 'fredy-integration-job';
const mockJob = {
  id: TEST_JOB_ID,
  customFields: [
    { id: 'cf1', name: 'custom1' },
    { id: 'cf2', name: 'custom2' }
  ],
  waypoints: [
    { id: 'w1', name: 'Work', location: 'Work Address', transportMode: 'transit' },
    { id: 'w2', name: 'Gym', location: 'Gym Address', transportMode: 'bicycling' }
  ]
};

const sampleListings = [
  // TODO: Replace with real sample listings
  {
    id: 'listing1',
    title: 'Sample Listing 1',
    price: 1000,
    size: 50,
    link: 'http://example.com/1',
    date_found: 123456,
    details: 'Details 1',
    custom1: 'foo',
    custom2: 'bar',
    address: 'Some address 1'
  },
  {
    id: 'listing2',
    title: 'Sample Listing 2',
    price: 2000,
    size: 70,
    link: 'http://example.com/2',
    date_found: 123457,
    details: 'Details 2',
    custom1: 'baz',
    custom2: 'qux',
    address: 'Some address 2'
  }
];

describe('FredyRuntime Integration', () => {
  let FredyRuntime, enhancedListingsStorage;

  before(async () => {
    enhancedListingsStorage = await esmock('../../lib/services/storage/enhancedListingsStorage.js');
    FredyRuntime = await esmock('../../lib/FredyRuntime.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: (jobId) => jobId === TEST_JOB_ID ? mockJob : null
      },
      '../../lib/services/storage/enhancedListingsStorage.js': enhancedListingsStorage,
      '../../lib/services/waypoint-calculator/waypointCalculator.js': {
        default: class {
          async calculateTravelTimes(listing, waypoints) {
            // Simulate travel time/distance fields
            const result = { ...listing };
            waypoints.forEach(wp => {
              result[`travelTime_${wp.id}`] = `${wp.id}_time`;
              result[`travelDistance_${wp.id}`] = `${wp.id}_distance`;
            });
            return result;
          }
        }
      }
    });
  });

  after(() => {
    enhancedListingsStorage.deleteJobFile(TEST_JOB_ID);
  });

  it('should enhance, calculate waypoints, and store listings in correct format', async () => {
    const runtime = new FredyRuntime({}, {}, 'provider', TEST_JOB_ID, {});
    // Enhance listings
    const enhanced = await runtime._enhanceListings(sampleListings);
    // Calculate waypoints
    const withWaypoints = await runtime._calculateWaypoints(enhanced);
    // Store enhanced listings
    await runtime._storeEnhancedListings(withWaypoints);
    // Fetch from storage
    const stored = enhancedListingsStorage.getListings(TEST_JOB_ID);
    // Should have all schema fields
    stored.forEach(listing => {
      expect(listing).to.have.property('id');
      expect(listing).to.have.property('title');
      expect(listing).to.have.property('price');
      expect(listing).to.have.property('size');
      expect(listing).to.have.property('link');
      expect(listing).to.have.property('date_found');
      expect(listing).to.have.property('details');
      expect(listing).to.have.property('custom1');
      expect(listing).to.have.property('custom2');
      expect(listing).to.have.property('travelTime_w1');
      expect(listing).to.have.property('travelDistance_w1');
      expect(listing).to.have.property('travelTime_w2');
      expect(listing).to.have.property('travelDistance_w2');
    });
    // Should match the number of input listings
    expect(stored).to.have.lengthOf(sampleListings.length);
  });
}); 