import fs from 'fs';
const path = '.';

const registeredProcessors = await Promise.all(
  fs
    .readdirSync('./lib/processors')
    .filter((file) => file.endsWith('.js') && file !== 'process.js')
    .map(async (integPath) => await import(`${path}/${integPath}`))
);

const findProcessor = (processor) => {
  return registeredProcessors.find((a) => a.config.id === processor.id);
};
export function processListings(listings, listingProcessors) {
  const processors = listingProcessors.map(findProcessor);
  const processedListingsPromises = listings.map(async (listing) => {
    return processors.reduce(
      async (listingAcc, processor) => await processor.processListing({ listing: await listingAcc }),
      listing
    );
  });
  return Promise.resolve(Promise.all(processedListingsPromises));
}
