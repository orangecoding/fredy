import { Listing } from '../provider/provider.js';
import { Processor, ProcessorConfig } from './process.js';

export async function processListing({ listing }) {
  return { ...listing, processed: true };
}

export default class StaticProcessor implements Processor {
  async processListing(listing: Listing): Promise<Listing> {
    return { ...listing, processed: true };
  }
}

export const config = {
  id: 'static',
  name: 'Static',
  description: 'This processor adds an extra `processed: true` property to the listing',
  config: {},
};

export const isProcessorConfig = (config: ProcessorConfig) => {
  return config.id === config.id;
};

export const isProviderTypeSupported = (provider: string) => {
  return true;
};
