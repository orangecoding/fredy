import { config } from '../../utils/utils.js';
import { RoutesClient } from '@googlemaps/routing';
import { GoogleAuth } from 'google-auth-library';
import logger from '../../utils/logger.js';

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
    let failedWaypoints = [];

    for (const waypoint of waypoints) {
      if (!waypoint.location || !waypoint.transportMode) {
        enhancedListing[`travelTime_${waypoint.id}`] = '';
        enhancedListing[`travelDistance_${waypoint.id}`] = '';
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
          logger.warn(`[WaypointCalculator] No route found for waypoint '${waypoint.name}' (id=${waypoint.id}) and listing '${listing.id || listing.title}'.`);
          throw new Error('No route found');
        }

        const route = response[0].routes[0];
        enhancedListing[`travelTime_${waypoint.id}`] = this._formatDuration(parseInt(route.duration.seconds));
        enhancedListing[`travelDistance_${waypoint.id}`] = this._formatDistance(route.distanceMeters);
      } catch (error) {
        logger.error(`[WaypointCalculator] Failed to calculate waypoints for waypoint '${waypoint.name}' (id=${waypoint.id}) and listing '${listing.id || listing.title}': ${error.message}`);
        enhancedListing[`travelTime_${waypoint.id}`] = 'N/A';
        enhancedListing[`travelDistance_${waypoint.id}`] = 'N/A';
        failedWaypoints.push({ waypoint, error: error.message });
      }
    }

    if (failedWaypoints.length > 0) {
      logger.info(`[WaypointCalculator] Summary: ${failedWaypoints.length} waypoint(s) failed for listing '${listing.id || listing.title}'. Details: ${failedWaypoints.map(f => `${f.waypoint.name} (id=${f.waypoint.id}): ${f.error}`).join('; ')}`);
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