import restana from 'restana';
import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { config } from '../../utils.js';
import { isAdmin } from '../security.js';
import { trackDemoJobCreated } from '../../services/tracking/Tracker.js';
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
  return user.isAdmin || job.userId === user.id;
}
jobRouter.get('/', async (req, res) => {
  const isUserAdmin = isAdmin(req);
  //show only the jobs which belongs to the user (or all of the user is an admin)
  res.body = jobStorage.getJobs().filter((job) => isUserAdmin || job.userId === req.session.currentUser);
  res.send();
});
jobRouter.get('/processingTimes', async (req, res) => {
  res.body = {
    interval: config.interval,
    lastRun: config.lastRun || null,
  };
  res.send();
});
jobRouter.post('/', async (req, res) => {
  const { provider, notificationAdapter, name, blacklist = [], jobId, enabled } = req.body;
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
  trackDemoJobCreated({
    name,
    provider,
    adapter: notificationAdapter,
  });
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
