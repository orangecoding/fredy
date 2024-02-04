import { Client, TravelMode } from '@googlemaps/google-maps-services-js';
import { Listing, Providers } from '../provider/provider.js';
import { Processor, ProcessorConfig } from './process.js';

import { config } from '../utils.js';

export default class DistanceProcessor implements Processor {
  async processListing({ listing }: { listing: Listing }): Promise<DistanceProcessorListing> {
    const client = new Client({});
    const addresses = config.googleMaps.destinations.map((destination) => destination.address);
    const response = await client.distancematrix({
      params: {
        origins: [listing.address],
        destinations: addresses,
        arrival_time: getNextMondayTimestamp(),
        mode: TravelMode.transit,
        key: config.googleMaps.apiKey,
      },
    });
    const distances = response.data.rows[0].elements.map((address, index) => {
      const destination = config.googleMaps.destinations[index];
      return {
        name: destination.name,
        address: response.data.destination_addresses[index],
        duration: address.duration.text,
        distance: address.distance.text,
      };
    });
    return { ...listing, distances };
  }
  notificationText({ listing }: { listing: DistanceProcessorListing }) {
    return (
      '\n' +
      listing.distances.reduce((notification, distance) => {
        notification += `${distance.name}(${distance.duration})\n`;
        return notification;
      }, '')
    );
  }
}

const getNextMondayTimestamp = (): number => {
  const now = new Date();
  const currentDay = now.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday

  // Calculate days until next Monday
  const daysUntilNextMonday = 1 + ((7 - currentDay) % 7);

  // Set the time to 9 AM
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilNextMonday);
  nextMonday.setHours(9, 0, 0, 0);

  // Get the timestamp
  const timestamp = nextMonday.getTime();

  return timestamp / 1000;
};

export const isProcessorConfig = (config: ProcessorConfig) => {
  return config.id === distanceProcessorConfig.id;
};

export const isProviderTypeSupported = (provider: string) => {
  return distanceProcessorConfig.supportedProviders.includes(Providers[provider]);
};

const distanceProcessorConfig: ProcessorConfig = {
  id: 'duration-google',
  name: 'Duration Provider (Google)',
  description: 'Add duration from flat to configured destinations',
  supportedProviders: [
    Providers.immobilienDe,
    Providers.immonet,
    Providers.immoswp,
    Providers.kleinanzeigen,
    Providers.neubauKompass,
  ],
  configMetadata: {},
};

interface DistanceProcessorListing extends Listing {
  distances: {
    name: string;
    address: string;
    duration: string;
    distance: string;
  }[];
}
