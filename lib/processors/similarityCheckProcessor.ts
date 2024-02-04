import { Listing } from '../provider/provider.js';
import { Processor, ProcessorConfig, ProcessorParameters } from './Processor.js';
import * as similarityCache from '../services/similarity-check/similarityCache.js';

export default class similarityCheckProcessor extends Processor {
  async shouldFilterListing({ listing, context }: ProcessorParameters): Promise<boolean> {
    console.log('processing a listing in similar processor');
    const similar = similarityCache.hasSimilarEntries(context.jobId, listing.title);
    if (similar) {
      console.debug(`Filtering similar entry for job with id ${context.jobId} with title: `, listing.title);
    } else {
      similarityCache.addCacheEntry(context.jobId, listing.title);
    }
    return similar;
  }
}

export const config: ProcessorConfig = {
  id: 'similarity-check',
  name: 'Similarity Check Processor',
  description: 'This processor ensures duplicate listings are filtered out',
  isGlobal: true,
  supportedProviders: 'all',
  configMetadata: {},
};

export const isProcessorConfig = (otherConfig: ProcessorConfig) => {
  return otherConfig.id === config.id;
};

export const isProviderTypeSupported = (provider: string) => {
  return true;
};
