import restana from 'restana';
import * as enhancedListingsStorage from '../../services/storage/enhancedListingsStorage.js';

const service = restana();
const dashboardRouter = service.newRouter();

dashboardRouter.get('/:jobId', async (req, res) => {
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

export { dashboardRouter }; 