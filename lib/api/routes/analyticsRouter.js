import restana from 'restana';
import * as listingStorage from '../../services/storage/listingsStorage.js';
const service = restana();
const analyticsRouter = service.newRouter();
analyticsRouter.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  res.body = listingStorage.getListingProviderDataForAnalytics(jobId) || {};
  res.send();
});
export { analyticsRouter };
