import * as fs from 'fs';
import { Listing, Providers } from '../provider/provider.js';

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
  const processedListingsPromises = listings.map(async (listing) => processListingByAllProcessors(listing, processors));

  return Promise.resolve(Promise.all(processedListingsPromises));
}

const processListingByAllProcessors = async (listing: Listing, processors: Processor[]): Promise<Listing> => {
  return processors.reduce(async (previousListingPromise, processor) => {
    const listing = await previousListingPromise;
    return processListingByOneProcessor(listing, processor);
  }, Promise.resolve(listing));
};

const processListingByOneProcessor = async (listing: Listing, processor: Processor): Promise<Listing> => {
  const processedListing = await processor.processListing({ listing });
  const updatedNotificationText = processedListing.notificationText + processor.notificationText({ listing });
  return { ...processedListing, notificationText: updatedNotificationText };
};

interface ProcessorConfigMetadata {}

export interface ProcessorConfig {
  id: string;
  name: string;
  description: string;
  supportedProviders?: Providers[] | Providers;
  configMetadata: ProcessorConfigMetadata;
}

export interface Processor {
  processListing: ({ listing }: { listing: Listing }) => Promise<Listing>;
  notificationText: ({ listing }: { listing: Listing }) => string;
}
export type ProcessorFile = {
  default: { new (): Processor };
  isProcessorConfig: (config: ProcessorConfig) => boolean;
  isProviderTypeSupported: (provider: string) => boolean;
};
