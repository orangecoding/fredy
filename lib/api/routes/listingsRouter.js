import restana from 'restana';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
import logger from '../../services/logger.js';

const service = restana();

const listingsRouter = service.newRouter();

listingsRouter.get('/table', async (req, res) => {
  const { page, pageSize = 50, filter, sortfield = null, sortdir = 'asc' } = req.query || {};

  res.body = listingStorage.queryListings({
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    filter: filter || undefined,
    sortField: sortfield || null,
    sortDir: sortdir === 'desc' ? 'desc' : 'asc',
    userId: req.session.currentUser,
    isAdmin: isAdminFn(req),
  });
  res.send();
});

listingsRouter.delete('/job', async (req, res) => {
  const { jobId } = req.body;
  try {
    listingStorage.deleteListingsByJobId(jobId);
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

listingsRouter.delete('/', async (req, res) => {
  const { ids } = req.body;
  try {
    if (Array.isArray(ids) && ids.length > 0) {
      listingStorage.deleteListingsById(ids);
    }
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

export { listingsRouter };
