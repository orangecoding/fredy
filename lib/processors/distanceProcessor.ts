import { Listing } from '../provider/provider.js';
import { Processor, ProcessorConfig } from './process.js';

export default class DistanceProcessor implements Processor {
  async processListing(listing: Listing): Promise<Listing> {
    // TODO - Add code to process distance
    return listing;
  }
}

export const isProcessorConfig = (config: ProcessorConfig) => {
  return config.id === distanceProcessorConfig.id;
};

export const isProviderTypeSupported = (provider: string) => {
  return distanceProcessorConfig.supportedProviders.includes(provider);
};

const distanceProcessorConfig: ProcessorConfig = {
  id: 'Google-Distance',
  name: 'Google Distance Matrix',
  description: 'This processor adds an extra `processed: true` property to the listing',
  supportedProviders: ['immoscout'],
  configMetadata: {},
};
