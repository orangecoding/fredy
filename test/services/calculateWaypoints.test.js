import { expect } from 'chai';
import esmock from 'esmock';
import * as jobStorage from '../../lib/services/storage/jobStorage.js';
import { config } from '../../lib/utils/utils.js';

describe('Waypoint Calculation', () => {
  let FredyRuntime;
  const mockConfig = {
    googleMaps: {
      apiKey: config.googleMaps?.apiKey || 'test-key'
    }
  };

  const mockJob = {
    id: 'test-job',
    waypoints: [
      {
        name: 'Work',
        location: 'BCG, Am Postbahnhof, Berlin',
        transportMode: 'transit'
      },
      {
        name: 'Gym',
        location: 'Kurfürstendamm 1, Berlin',
        transportMode: 'walking'
      }
    ]
  };

  const mockListing = {
    id: '123',
    title: 'Test Listing',
    address: 'Görlitzer Straße 1, Berlin'
  };

  before(async () => {
    FredyRuntime = await esmock('../../lib/FredyRuntime.js', {
      '../../lib/services/storage/jobStorage.js': {
        getJob: (jobId) => jobId === 'test-job' ? mockJob : null
      },
      '../../lib/utils/utils.js': {
        config: mockConfig
      }
    });
  });

  describe('_calculateWaypoints', () => {
    it('should return original listings if no waypoints are defined', async () => {
      const fredy = new FredyRuntime({}, {}, 'provider', 'no-waypoints-job', {});
      const listings = [mockListing];
      
      const result = await fredy._calculateWaypoints(listings);
      expect(result).to.deep.equal(listings);
    });

    it('should calculate travel times for each waypoint', async () => {
      const fredy = new FredyRuntime({}, {}, 'provider', 'test-job', {});
      const listings = [mockListing];
      
      const result = await fredy._calculateWaypoints(listings);
      expect(result).to.have.lengthOf(1);
      
      const enhancedListing = result[0];
      expect(enhancedListing).to.have.property('travelTimes');
      expect(enhancedListing.travelTimes).to.have.property('Work');
      expect(enhancedListing.travelTimes).to.have.property('Gym');
      
      // Check that we got actual travel times
      expect(enhancedListing.travelTimes.Work).to.have.property('mode', 'transit');
      expect(enhancedListing.travelTimes.Work).to.have.property('duration').that.is.a('string');
      expect(enhancedListing.travelTimes.Work).to.have.property('distance').that.is.a('string');
      expect(enhancedListing.travelTimes.Work.duration).to.not.equal('N/A');
      expect(enhancedListing.travelTimes.Work.distance).to.not.equal('N/A');
    });

    it('should handle API errors gracefully', async () => {
      // Create a job with an invalid API key to force an error
      const fredy = new FredyRuntime({}, {}, 'provider', 'test-job', {});
      const listings = [mockListing];
      
      const FredyRuntimeWithError = await esmock('../../lib/FredyRuntime.js', {
        '../../lib/services/storage/jobStorage.js': {
          getJob: (jobId) => jobId === 'test-job' ? mockJob : null
        },
        '../../lib/utils/utils.js': {
          config: {
            googleMaps: {
              apiKey: 'invalid-key'
            }
          }
        },
        '../../lib/services/waypoint-calculator/waypointCalculator.js': {
          default: class {
            constructor() {
              throw new Error('Invalid API key');
            }
          }
        }
      });
      
      const fredyWithError = new FredyRuntimeWithError({}, {}, 'provider', 'test-job', {});
      const result = await fredyWithError._calculateWaypoints(listings);
      
      // Should have travelTimes with N/A values
      expect(result[0]).to.have.property('travelTimes');
      expect(result[0].travelTimes.Work).to.deep.include({
        mode: 'transit',
        duration: 'N/A',
        distance: 'N/A'
      });
    });

    it('should include all waypoints in travelTimes with N/A for invalid ones', async () => {
      const fredy = new FredyRuntime({}, {}, 'provider', 'test-job', {});
      const listings = [mockListing];
      
      // Mock job with invalid waypoint
      const jobWithInvalidWaypoint = {
        ...mockJob,
        waypoints: [
          ...mockJob.waypoints,
          {
            name: 'Invalid',
            location: '', // Missing location
            transportMode: 'transit'
          },
          {
            name: 'AlsoInvalid',
            location: 'Somewhere',
            transportMode: '' // Missing transport mode
          }
        ]
      };

      const FredyRuntimeWithInvalidWaypoint = await esmock('../../lib/FredyRuntime.js', {
        '../../lib/services/storage/jobStorage.js': {
          getJob: (jobId) => jobId === 'test-job' ? jobWithInvalidWaypoint : null
        },
        '../../lib/utils/utils.js': {
          config: mockConfig
        }
      });
      
      const fredyWithInvalidWaypoint = new FredyRuntimeWithInvalidWaypoint({}, {}, 'provider', 'test-job', {});
      const result = await fredyWithInvalidWaypoint._calculateWaypoints(listings);
      
      // Should have all waypoints in travelTimes
      expect(result[0].travelTimes).to.have.property('Work');
      expect(result[0].travelTimes).to.have.property('Gym');
      expect(result[0].travelTimes).to.have.property('Invalid');
      expect(result[0].travelTimes).to.have.property('AlsoInvalid');

      // Valid waypoints should have calculated values
      expect(result[0].travelTimes.Work).to.have.property('mode', 'transit');
      expect(result[0].travelTimes.Work).to.have.property('duration').that.is.a('string');
      expect(result[0].travelTimes.Work).to.have.property('distance').that.is.a('string');
      expect(result[0].travelTimes.Work.duration).to.not.equal('N/A');
      xexpect(result[0].travelTimes.Work.distance).to.not.equal('N/A');

      // Invalid waypoints should have N/A values
      expect(result[0].travelTimes.Invalid).to.deep.include({
        mode: 'transit',
        duration: 'N/A',
        distance: 'N/A'
      });
      expect(result[0].travelTimes.AlsoInvalid).to.deep.include({
        mode: 'N/A',
        duration: 'N/A',
        distance: 'N/A'
      });
    });
  });
}); 