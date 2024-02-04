import { Listing } from '../provider/provider.js';
import { Processor, ProcessorConfig, ProcessorContext, ProcessorFile } from './Processor.js';

// Processors
import * as DistanceProcessors from './distanceProcessor.js';
import * as StaticProcessors from './staticProcessor.js';
import * as SimilarityCheckProcessor from './similarityCheckProcessor.js';

const registeredProcessors: ProcessorFile[] = [DistanceProcessors, StaticProcessors, SimilarityCheckProcessor];

const globalProcessorsConfig = registeredProcessors
  .filter((processor) => processor.config.isGlobal)
  .map((processor) => processor.config);

const findProcessor = (processor: ProcessorConfig): Processor => {
  const ProcessorFile = registeredProcessors.find((processorClass) => processorClass.isProcessorConfig(processor));
  return new ProcessorFile.default();
};

export async function processListings(
  listings: Listing[],
  listingProcessorsConfig: ProcessorConfig[],
  context: ProcessorContext
): Promise<Listing[]> {
  const combinedProcessorsConfig = globalProcessorsConfig.concat(listingProcessorsConfig);
  const processors = combinedProcessorsConfig.map(findProcessor);
  const processedListingsPromises = listings.map(async (listing) =>
    processListingByAllProcessors(listing, processors, context)
  );
  const processedListings = await Promise.all(processedListingsPromises);
  return processedListings.filter((listing) => listing !== null);
}

const processListingByAllProcessors = async (
  listing: Listing,
  processors: Processor[],
  context: ProcessorContext
): Promise<Listing | null> => {
  let updatedListing = listing;

  for (let i = 0; i < processors.length; i++) {
    const processor = processors[i];
    updatedListing = await processListingByOneProcessor(updatedListing, processor, context);
    if (updatedListing == null) {
      return null;
    }
  }
  return updatedListing;
};

const processListingByOneProcessor = async (
  listing: Listing,
  processor: Processor,
  context: ProcessorContext
): Promise<Listing> => {
  const isListingFilteredOut = await processor.shouldFilterListing({ listing, context });
  if (isListingFilteredOut) {
    return null;
  }
  const processedListing = await processor.processListing({ listing, context });
  const previousNotificationText = processedListing.notificationText || '';
  const updatedNotificationText =
    previousNotificationText + processor.notificationText({ listing: processedListing, context });
  return { ...processedListing, notificationText: updatedNotificationText };
};
