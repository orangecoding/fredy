import restana from 'restana';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import { isAdmin as isAdminFn } from '../security.js';
const service = restana();

const listingsRouter = service.newRouter();

listingsRouter.get('/table', async (req, res) => {
  const { page, pageSize = 50, filter, sortfield = null, sortdir = 'asc' } = req.query || {};

  const result = listingStorage.queryListings({
    page: page ? parseInt(page, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize, 10) : 50,
    filter: filter || undefined,
    sortField: sortfield || null,
    sortDir: sortdir === 'desc' ? 'desc' : 'asc',
    userId: req.session.currentUser,
    isAdmin: isAdminFn(req),
  });
  res.body = result;
  res.send();
});
export { listingsRouter };
