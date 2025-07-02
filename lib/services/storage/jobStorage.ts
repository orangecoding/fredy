import { JSONFileSync } from 'lowdb/node';
import { nanoid } from 'nanoid';
import * as listingStorage from './listingsStorage';
import { getDirName } from '../../utils';
import path from 'path';
import LowdashAdapter from './LowDashAdapter';
import { JobsDbData } from './types';
import { Job } from '#types/Jobs.ts';
import { ApiSaveJobReq } from '#types/Api.ts';
import { getUser } from './userStorage';

const file: string = path.join(getDirName(), '../', 'db/jobs.json');
const adapter: JSONFileSync<JobsDbData> = new JSONFileSync(file);
const db: LowdashAdapter<JobsDbData> = new LowdashAdapter(adapter, { jobs: [] as Job[] });

db.read();

export const upsertJob = ({
  id,
  name,
  blacklist = [],
  enabled = true,
  provider,
  notificationAdapter,
  userId,
}: ApiSaveJobReq & { userId: string }) => {
  const currentJob =
    id == null
      ? undefined
      : db.chain
          .get('jobs')
          .find((job) => job.id === id)
          .value();
  const jobs = db.chain
    .get('jobs')
    .filter((job) => job.id !== id)
    .value();
  const newJob: Job = {
    id: id || nanoid(),
    //make sure to not overwrite the user id in case an admin changes the job
    userId: !currentJob ? userId! : currentJob.userId,
    enabled,
    name,
    blacklist,
    provider,
    notificationAdapter,
  };
  jobs.push(newJob);
  db.chain.set('jobs', jobs).value();
  db.write();
};

export const getJob = (jobId: string): Job | null => {
  const job = db.chain
    .get('jobs')
    .find((job) => job.id === jobId)
    .value();
  if (job == null) return null;
  return {
    ...job,
    numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id),
  };
};

export const setJobStatus = ({ jobId, status }: { jobId: string; status: boolean }) => {
  db.chain
    .get('jobs')
    .find((job) => job.id === jobId)
    .assign({ enabled: status })
    .value();
  db.write();
};

export const removeJob = (jobId: string) => {
  listingStorage.removeListings(jobId);
  let foundJob = false;
  db.chain
    .get('jobs')
    .remove((job) => {
      if (job.id === jobId) foundJob = true;
      return job.id === jobId;
    })
    .value();
  db.write();
  return foundJob;
};

export const removeJobsByUserId = (userId: string) => {
  let cntDeletedJobs = 0;
  db.chain
    .get('jobs')
    .filter((job) => job.userId === userId)
    .forEach((job) => {
      listingStorage.removeListings(job.id);
      cntDeletedJobs++;
    })
    .remove((job) => job.userId === userId)
    .value();
  db.write();
  return cntDeletedJobs;
};

export const removeJobsByUserName = (userName: string) => {
  const user = getUser(userName);
  if (user == null) {
    console.error(`User ${userName} not found, cannot remove jobs`);
    return;
  }
  return removeJobsByUserId(user.id);
};

export const getJobs = () => {
  return db.chain
    .get('jobs')
    .map(
      (job): Job => ({
        ...job,
        numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id),
      }),
    )
    .value();
};
