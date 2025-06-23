import restana from 'restana';
import * as enhancedListingsStorage from '../../services/storage/enhancedListingsStorage.js';

const service = restana();
const dashboardRouter = service.newRouter();

dashboardRouter.get('/:jobId/data', async (req, res) => {
  try {
    const { jobId } = req.params;
    const listings = await enhancedListingsStorage.getListings(jobId);
    res.body = listings;
    res.send();
  } catch (error) {
    console.error('Error fetching enhanced listings:', error);
    res.send(new Error('Failed to fetch enhanced listings'));
  }
});

dashboardRouter.get('/:jobId/schema', async (req, res) => {
  try {
    const { jobId } = req.params;
    const schema = enhancedListingsStorage.getSchema(jobId);
    res.body = schema;
    res.send();
  } catch (error) {
    console.error('Error fetching job schema:', error);
    res.send(new Error('Failed to fetch job schema'));
  }
});

export { dashboardRouter }; 