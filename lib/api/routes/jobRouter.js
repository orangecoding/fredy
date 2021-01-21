const service = require('restana')();
const jobRouter = service.newRouter();
const jobStorage = require('../../services/storage/jobStorage');
const userStorage = require('../../services/storage/userStorage');
const { isAdmin } = require('../security');

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

exports.jobRouter = jobRouter;
