import restana from 'restana';
import Database from 'better-sqlite3';
import { isAdmin } from '../security.js';
import * as userStorage from '../../services/storage/userStorage.js';

const service = restana();
const listingsRouter = service.newRouter();

function doesJobBelongToUser(jobKey, req) {
  const userId = req.session.currentUser;
  if (userId == null) {
    return false;
  }
  const user = userStorage.getUser(userId);
  if (user == null) {
    return false;
  }
  // If user is admin, they can see all listings
  if (user.isAdmin) {
    return true;
  }
  // For non-admin users, we need to check if the job belongs to them
  // This would require checking the jobs table, but for now we'll allow access
  // TODO: Add proper job ownership check
  return true;
}

listingsRouter.get('/', async (req, res) => {
  try {
    const db = new Database('db/listings.db');
    const isUserAdmin = isAdmin(req);

    let query = 'SELECT * FROM listing ORDER BY rowid DESC';
    let listings;

    if (isUserAdmin) {
      // Admin can see all listings
      listings = db.prepare(query).all();
    } else {
      // Non-admin users see listings from their jobs only
      // For now, we'll show all listings but this should be filtered by job ownership
      listings = db.prepare(query).all();
    }

    db.close();
    res.body = listings;
    res.send();
  } catch (error) {
    res.status(500);
    res.body = { error: error.message };
    res.send();
  }
});

listingsRouter.get('/job/:jobKey', async (req, res) => {
  const { jobKey } = req.params;

  try {
    if (!doesJobBelongToUser(jobKey, req)) {
      res.status(403);
      res.body = { error: 'You are not authorized to view listings for this job' };
      res.send();
      return;
    }

    const db = new Database('db/listings.db');
    const listings = db.prepare('SELECT * FROM listing WHERE jobKey = ? ORDER BY rowid DESC').all(jobKey);
    db.close();

    res.body = listings;
    res.send();
  } catch (error) {
    console.error('Error fetching listings for job:', error);
    res.status(500);
    res.body = { error: error.message };
    res.send();
  }
});

export { listingsRouter };
