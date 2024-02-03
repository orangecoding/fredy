import * as fs from 'fs';
import { Listing } from '../provider/provider.js';

// Processors
import * as DistanceProcessors from './distanceProcessor.js';
import * as StaticProcessors from './staticProcessor.js';

const registeredProcessors: ProcessorFile[] = [DistanceProcessors, StaticProcessors];

const findProcessor = (processor: ProcessorConfig): Processor => {
  const ProcessorFile = registeredProcessors.find((processorClass) => processorClass.isProcessorConfig(processor));
  return new ProcessorFile.default();
};
export function processListings(listings: Listing[], listingProcessorsConfig: ProcessorConfig[]) {
  const processors = listingProcessorsConfig.map(findProcessor);
  const processedListingsPromises = listings.map(async (listing) => {
    return processors.reduce(
      async (listingAcc, processor) => await processor.processListing({ listing: await listingAcc }),
      listing
    );
  });
  return Promise.resolve(Promise.all(processedListingsPromises));
}
interface ProcessorConfigMetadata {}

export interface ProcessorConfig {
  id: string;
  name: string;
  description: string;
  supportedProviders?: string[] | string;
  configMetadata: ProcessorConfigMetadata;
}

export interface Processor {
  processListing: (listing: Listing) => Promise<Listing>;
}
export type ProcessorFile = {
  default: { new (): Processor };
  isProcessorConfig: (config: ProcessorConfig) => boolean;
  isProviderTypeSupported: (provider: string) => boolean;
};
