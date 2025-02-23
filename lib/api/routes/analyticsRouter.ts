import restana from 'restana';
import * as listingStorage from '../../services/storage/listingsStorage.js';
const service = restana();
const analyticsRouter = service.newRouter();
analyticsRouter.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = listingStorage.getListingProviderDataForAnalytics(jobId) || {};
  res.send();
});
export { analyticsRouter };
