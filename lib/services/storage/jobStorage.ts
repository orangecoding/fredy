import { JSONFileSync } from 'lowdb/node';
import { nanoid } from 'nanoid';
import * as listingStorage from './listingsStorage.js';
import { getDirName } from '../../utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';

const file = path.join(getDirName(), '../', 'db/jobs.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, { jobs: [] });

db.read();


export const upsertJob = ({
  jobId,
  name,
  blacklist = [],
  enabled = true,
  provider,
  notificationAdapter,
  userId
}: any) => {
  const currentJob =
    jobId == null
      ? null
      : db.chain
          .get('jobs')
          .find((job: any) => job.id === jobId)
          .value();
  const jobs = db.chain
    .get('jobs')
    .filter((job: any) => job.id !== jobId)
    .value();
  jobs.push({
    id: jobId || nanoid(),
    //make sure to not overwrite the user id in case an admin changes the job
    userId: currentJob == null ? userId : currentJob.userId,
    enabled,
    name,
    blacklist,
    provider,
    notificationAdapter,
  });
  db.chain.set('jobs', jobs).value();
  db.write();
};
export const getJob = (jobId: any) => {
  const job = db.chain
    .get('jobs')
    .find((job: any) => job.id === jobId)
    .value();
  if (job == null) {
    return null;
  }
  return {
    ...job,
    // @ts-expect-error TS(2339): Property 'length' does not exist on type 'number'.
    numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id).length,
  };
};
export const setJobStatus = ({
  jobId,
  status
}: any) => {
  db.chain
    .get('jobs')
    .find((job: any) => job.id === jobId)
    .assign({ enabled: status })
    .value();
  db.write();
};
export const removeJob = (jobId: any) => {
  listingStorage.removeListings(jobId);
  db.chain
    .get('jobs')
    .remove((job: any) => job.id === jobId)
    .value();
  db.write();
};
export const removeJobsByUserId = (userId: any) => {
  db.chain
    .get('jobs')
    .filter((job: any) => job.userId === userId)
    .forEach((job: any) => listingStorage.removeListings(job.id));
  db.chain
    .get('jobs')
    .remove((job: any) => job.userId === userId)
    .value();
  db.write();
};
export const removeJobsByUserName = (userName: any) => {
  db.chain
      .get('jobs')
      .filter((job: any) => job.username === userName)
      .forEach((job: any) => listingStorage.removeListings(job.id));
  db.chain
      .get('jobs')
      .remove((job: any) => job.username === userName)
      .value();
  db.write();
};
export const getJobs = () => {
  return db.chain
    .get('jobs')
    .map((job: any) => ({
    ...job,
    numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id)
  }))
    .value();
};
