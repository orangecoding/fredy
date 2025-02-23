import restana from 'restana';
import * as listingStorage from '#services/storage/listingsStorage';
const service = restana();
const analyticsRouter = service.newRouter();
analyticsRouter.get('/:jobId', async (req, res) => {
  const jobId: string = req.params['jobId'] as string;
  const analyticsData = listingStorage.getListingProviderDataForAnalytics(jobId) || {};
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(analyticsData));
});
export { analyticsRouter };
