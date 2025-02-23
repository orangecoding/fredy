import restana from 'restana';
import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { config } from '../../utils.js';
import { isAdmin } from '../security.js';
import { trackDemoJobCreated } from '../../services/tracking/Tracker.js';
const service = restana();
const jobRouter = service.newRouter();
function doesJobBelongsToUser(job: any, req: any) {
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
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = jobStorage.getJobs().filter((job: any) => isUserAdmin || job.userId === req.session.currentUser);
  res.send();
});
jobRouter.get('/processingTimes', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'body' does not exist on type 'ServerResp... Remove this comment to see the full error message
  res.body = {
    // @ts-expect-error TS(2339): Property 'interval' does not exist on type '{}'.
    interval: config.interval,
    // @ts-expect-error TS(2339): Property 'lastRun' does not exist on type '{}'.
    lastRun: config.lastRun || null,
  };
  res.send();
});
jobRouter.post('/', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'provider' does not exist on type 'Body |... Remove this comment to see the full error message
  const { provider, notificationAdapter, name, blacklist = [], jobId, enabled } = req.body;
  try {
    jobStorage.upsertJob({
      // @ts-expect-error TS(2339): Property 'session' does not exist on type 'Incomin... Remove this comment to see the full error message
      userId: req.session.currentUser,
      jobId,
      enabled,
      name,
      blacklist,
      provider,
      notificationAdapter,
    });
  } catch (error) {
    // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
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
  // @ts-expect-error TS(2339): Property 'jobId' does not exist on type 'Body | un... Remove this comment to see the full error message
  const { jobId } = req.body;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying to remove a job that is not associated to your user'));
    } else {
      jobStorage.removeJob(jobId);
    }
  } catch (error) {
    // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    res.send(new Error(error));
    console.error(error);
  }
  res.send();
});
jobRouter.put('/:jobId/status', async (req, res) => {
  // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Body | u... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
    res.send(new Error(error));
    console.error(error);
  }
  res.send();
});
export { jobRouter };
