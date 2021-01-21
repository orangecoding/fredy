const service = require('restana')();
const analyticsRouter = service.newRouter();
const listingStorage = require('../../services/storage/listingsStorage');

analyticsRouter.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;

  res.body = listingStorage.getListingProviderDataForAnalytics(jobId) || {};
  res.send();
});

exports.analyticsRouter = analyticsRouter;
