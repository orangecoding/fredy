import restana from 'restana';
import fetch from 'node-fetch';
import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import * as immoscoutProvider from '../../provider/immoscout.js';
import { config } from '../../utils.js';
import { isAdmin } from '../security.js';
const service = restana();
const jobRouter = service.newRouter();
function doesJobBelongsToUser(job, req) {
  const userId = req.session.currentUser;
  if (userId == null) {
    return false;
  }
  const user = userStorage.getUser(userId);
  if (user == null) {
    return false;
  }
  return user.isAdmin || job.userId === job.userId;
}
jobRouter.get('/', async (req, res) => {
  const isUserAdmin = isAdmin(req);
  //show only the jobs which belongs to the user (or all of the user is an admin)
  res.body = jobStorage.getJobs().filter((job) => isUserAdmin || job.userId === req.session.currentUser);
  res.send();
});
jobRouter.get('/processingTimes', async (req, res) => {
  let scrapingAntData = null;
  if (config.scrapingAnt.apiKey != null && config.scrapingAnt.apiKey.length > 0) {
    try {
      const response = await fetch(`https://api.scrapingant.com/v2/usage?x-api-key=${config.scrapingAnt.apiKey}`);
      scrapingAntData = await response.json();
    } catch (Exception) {
      console.error('Could not query plan data from scraping ant.', Exception);
    }
  }
  res.body = {
    interval: config.interval,
    lastRun: config.lastRun || null,
    scrapingAntData,
  };
  res.send();
});
jobRouter.post('/', async (req, res) => {
  const { provider, notificationAdapter, name, blacklist = [], jobId, enabled } = req.body;
  if (
    provider.find((p) => p.id === immoscoutProvider.metaInformation.id) != null &&
    (config.scrapingAnt.apiKey == null || config.scrapingAnt.apiKey.length === 0)
  ) {
    res.send(
      new Error('To use Immoscout as provider, you need to configure ScrapingAnt first. Please check the readme.')
    );
    return;
  }
  try {
    jobStorage.upsertJob({
      userId: req.session.currentUser,
      jobId,
      enabled,
      name,
      blacklist,
      provider,
      notificationAdapter,
    });
  } catch (error) {
    res.send(new Error(error));
    console.error(error);
  }
  res.send();
});
jobRouter.delete('', async (req, res) => {
  const { jobId } = req.body;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying to remove a job that is not associated to your user'));
    } else {
      jobStorage.removeJob(jobId);
    }
  } catch (error) {
    res.send(new Error(error));
    console.error(error);
  }
  res.send();
});
jobRouter.put('/:jobId/status', async (req, res) => {
  const { status } = req.body;
  const { jobId } = req.params;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying change a job that is not associated to your user'));
    } else {
      jobStorage.setJobStatus({
        jobId,
        status,
      });
    }
  } catch (error) {
    res.send(new Error(error));
    console.error(error);
  }
  res.send();
});
export { jobRouter };
