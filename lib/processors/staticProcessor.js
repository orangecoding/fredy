export async function processListing({ listing }) {
  return { ...listing, processed: true };
}
export const config = {
  id: 'static',
  name: 'Static',
  description: 'This processor adds an extra `processed: true` property to the listing',
  config: {},
};
