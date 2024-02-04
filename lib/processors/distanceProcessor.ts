import { Client, TravelMode } from '@googlemaps/google-maps-services-js';
import { Listing, Providers } from '../provider/provider.js';
import { Processor, ProcessorConfig, ProcessorContext } from './Processor.js';

import { config as globalConfig } from '../utils.js';

export default class DistanceProcessor extends Processor {
  async processListing({ listing }: { listing: Listing }): Promise<DistanceProcessorListing> {
    const client = new Client({});
    const addresses = globalConfig.googleMaps.destinations.map((destination) => destination.address);
    const response = await client.distancematrix({
      params: {
        origins: [listing.address],
        destinations: addresses,
        arrival_time: getNextMondayTimestamp(),
        mode: TravelMode.transit,
        key: globalConfig.googleMaps.apiKey,
      },
    });
    const distances = response.data.rows[0].elements.map((address, index) => {
      const destination = globalConfig.googleMaps.destinations[index];
      return {
        name: destination.name,
        address: response.data.destination_addresses[index],
        duration: address.duration.text,
        distance: address.distance.text,
      };
    });
    return { ...listing, distances };
  }
  notificationText({ listing, context }: { listing: DistanceProcessorListing; context: ProcessorContext }) {
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

export const isProcessorConfig = (otherConfig: ProcessorConfig) => {
  return otherConfig.id === config.id;
};

export const isProviderTypeSupported = (provider: string) => {
  return config.supportedProviders.includes(Providers[provider]);
};

export const config: ProcessorConfig = {
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
  isGlobal: false,
};

interface DistanceProcessorListing extends Listing {
  distances: {
    name: string;
    address: string;
    duration: string;
    distance: string;
  }[];
}
