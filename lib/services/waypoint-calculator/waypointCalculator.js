import { config } from '../../utils.js';
import { RoutesClient } from '@googlemaps/routing';
import { GoogleAuth } from 'google-auth-library';

const VALID_TRANSPORT_MODES = {
  'transit': 'TRANSIT',
  'driving': 'DRIVING',
  'walking': 'WALKING',
  'bicycling': 'BICYCLING'
};

export class WaypointCalculator {
  constructor() {
    if (!config.googleMaps?.apiKey) {
      throw new Error('Google Maps API key is required for waypoint calculations');
    }
    const apiKey = config.googleMaps.apiKey;
    this.routingClient = new RoutesClient({
      authClient: new GoogleAuth().fromAPIKey(apiKey)
    });
  }

  async calculateTravelTimes(listing, waypoints) {
    if (!waypoints?.length) {
      return listing;
    }

    const enhancedListing = { ...listing, travelTimes: {} };

    for (const waypoint of waypoints) {
      if (!waypoint.location || !waypoint.transportMode) {
        enhancedListing.travelTimes[waypoint.name] = {
          mode: waypoint.transportMode || 'N/A',
          duration: 'N/A',
          distance: 'N/A'
        };
        continue;
      }

      try {
        const request = {
          origin: {
            address: listing.address
          },
          destination: {
            address: waypoint.location
          },
          travelMode: this._validateTransportMode(waypoint.transportMode),
          languageCode: 'en-US',
          regionCode: 'de',
          units: 'METRIC'
        };

        // Only add routingPreference for driving mode
        if (waypoint.transportMode.toLowerCase() === 'driving') {
          request.routingPreference = 'TRAFFIC_UNAWARE';
        }

        const options = {
          otherArgs: {
            headers: {
              'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
            }
          }
        };

        const response = await this.routingClient.computeRoutes(request, options);
        
        if (!response?.[0].routes?.[0]) {
          throw new Error('No route found');
        }

        const route = response[0].routes[0];
        enhancedListing.travelTimes[waypoint.name] = {
          mode: waypoint.transportMode,
          duration: this._formatDuration(parseInt(route.duration.seconds)),
          distance: this._formatDistance(route.distanceMeters)
        };
      } catch (error) {
        console.warn(`Failed to calculate travel time for waypoint ${waypoint.name}:`, error.message);
        enhancedListing.travelTimes[waypoint.name] = {
          mode: waypoint.transportMode,
          duration: 'N/A',
          distance: 'N/A'
        };
      }
    }

    return enhancedListing;
  }

  _validateTransportMode(mode) {
    const apiMode = VALID_TRANSPORT_MODES[mode.toLowerCase()];
    if (!apiMode) {
      throw new Error(`Invalid transport mode: ${mode}. Valid modes are: ${Object.keys(VALID_TRANSPORT_MODES).join(', ')}`);
    }
    return apiMode;
  }

  _formatDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }

  _formatDistance(meters) {
    const kilometers = (meters / 1000).toFixed(1);
    return `${kilometers} km`;
  }
} 
export default WaypointCalculator; 