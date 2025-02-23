import restana from 'restana';
import * as jobStorage from '#services/storage/jobStorage';
import * as userStorage from '#services/storage/userStorage';
import { config } from '../../utils';
import { isAdmin } from '../security';
import { trackDemoJobCreated } from '#services/tracking/Tracker';
import { User } from '#types/User.ts';
import { Job } from '#types/Jobs.ts';
import {
  ApiDeleteJobReq,
  ApiProcessingTimesResponse,
  ApiSaveJobReq,
  ApiSetJobStatusReq,
  ReqWithSession,
} from '#types/api.ts';
import { HTTPError } from '../errorHandling';

const service = restana();
const jobRouter = service.newRouter();

function doesJobBelongsToUser(job: Job | null, req: ReqWithSession) {
  const userId = req.session?.currentUser;
  if (!userId) {
    return false;
  }
  const user: User | null = userStorage.getUser(userId);
  if (user == null) {
    return false;
  }
  return user.isAdmin || (job != null && job.userId === userId);
}

jobRouter.get('/', async (req: ReqWithSession, res) => {
  const isUserAdmin: boolean = isAdmin(req);
  //show only the jobs which belongs to the user (or all of the user is an admin)
  const jobs: Job[] = jobStorage.getJobs().filter((job) => isUserAdmin || job.userId === req.session?.currentUser);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(jobs));
});

jobRouter.get('/processingTimes', async (req: ReqWithSession, res) => {
  const responseData: ApiProcessingTimesResponse = {
    interval: config.interval ?? 60,
    lastRun: config.lastRun || null,
  };
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(responseData));
});

jobRouter.post('/', async (req: ReqWithSession, res) => {
  const jobData = req.body as unknown as ApiSaveJobReq;

  try {
    jobData.userId = req.session?.currentUser as string;
    jobStorage.upsertJob(jobData as ApiSaveJobReq & { userId: string });
  } catch (error: unknown) {
    console.error(error);
    new HTTPError(res)
      .setStatusCode(500)
      .addError(error as string | Error)
      .send();
    return;
  }

  trackDemoJobCreated({
    name: jobData.name,
    provider: jobData.provider.map((provider) => provider.id),
    adapter: jobData.notificationAdapter.map((adapter) => adapter.id),
  });
  res.send('');
});

jobRouter.delete('', async (req: ReqWithSession, res) => {
  const jobId: string = (req.body as unknown as ApiDeleteJobReq).jobId;
  try {
    const job: Job | null = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      new HTTPError(res)
        .setStatusCode(403)
        .addError('You are trying to remove a job that is not associated to your user')
        .send();
    } else {
      jobStorage.removeJob(jobId);
    }
  } catch (error: unknown) {
    console.error(error);
    new HTTPError(res)
      .setStatusCode(500)
      .addError(error as string | Error)
      .send();
    return;
  }
  res.send();
});

jobRouter.put('/:jobId/status', async (req: ReqWithSession, res) => {
  const status: boolean = (req.body as unknown as ApiSetJobStatusReq).status;
  const jobId: string = req.params['jobId'] as string;
  try {
    const job: Job | null = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      new HTTPError(res)
        .setStatusCode(403)
        .addError('You are trying change a job that is not associated to your user')
        .send();
    } else {
      jobStorage.setJobStatus({
        jobId,
        status,
      });
    }
  } catch (error: unknown) {
    console.error(error);
    new HTTPError(res)
      .setStatusCode(500)
      .addError(error as string | Error)
      .send();
    return;
  }
  res.send();
});

export { jobRouter };
