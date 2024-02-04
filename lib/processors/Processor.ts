import { Listing, Providers } from '../provider/provider.js';

export abstract class Processor {
  notificationText({ listing }: ProcessorParameters): string {
    return listing.notificationText || '';
  }
  processListing({ listing }: ProcessorParameters): Promise<Listing> {
    return Promise.resolve(listing);
  }
  shouldFilterListing(params: ProcessorParameters): Promise<boolean> {
    return Promise.resolve(false);
  }
}

interface ProcessorConfigMetadata {}

export interface ProcessorConfig {
  id: string;
  name: string;
  description: string;
  supportedProviders: Providers[] | Providers | 'all';
  configMetadata: ProcessorConfigMetadata;
  isGlobal: boolean;
}

export type ProcessorContext = {
  jobId: string;
  providerId: string;
};

export type ProcessorParameters = {
  listing: Listing;
  context: ProcessorContext;
};

export type ProcessorFile = {
  default: { new (): Processor };
  isProcessorConfig: (config: ProcessorConfig) => boolean;
  isProviderTypeSupported: (provider: string) => boolean;
  config: ProcessorConfig;
};
