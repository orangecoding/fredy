import { JSONFileSync } from 'lowdb/node';
import { nanoid } from 'nanoid';
import * as listingStorage from './listingsStorage.js';
import { getDirName } from '../../utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';
import * as enhancedListingsStorage from './enhancedListingsStorage.js';

const file = path.join(getDirName(), '../', 'db/jobs.json');
const adapter = new JSONFileSync(file);
const db = new LowdashAdapter(adapter, { jobs: [] });

db.read();

export const upsertJob = ({ jobId, name, blacklist = [], enabled = true, provider, notificationAdapter, userId, customFields = [] }) => {
  const currentJob =
    jobId == null
      ? null
      : db.chain
          .get('jobs')
          .find((job) => job.id === jobId)
          .value();
  const jobs = db.chain
    .get('jobs')
    .filter((job) => job.id !== jobId)
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
    customFields,
  });
  db.chain.set('jobs', jobs).value();
  db.write();

  // Initialize enhanced listings storage for the new job
  enhancedListingsStorage.init(newJobId);
};

export const getJob = (jobId) => {
  const job = db.chain
    .get('jobs')
    .find((job) => job.id === jobId)
    .value();
  if (job == null) {
    return null;
  }
  return {
    ...job,
    numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id).length,
  };
};

export const setJobStatus = ({ jobId, status }) => {
  db.chain
    .get('jobs')
    .find((job) => job.id === jobId)
    .assign({ enabled: status })
    .value();
  db.write();
};

export const removeJob = (jobId) => {
  listingStorage.removeListings(jobId);
  // Delete enhanced listings storage for the job
  enhancedListingsStorage.deleteJobFile(jobId);
  db.chain
    .get('jobs')
    .remove((job) => job.id === jobId)
    .value();
  db.write();
};

export const removeJobsByUserId = (userId) => {
  db.chain
    .get('jobs')
    .filter((job) => job.userId === userId)
    .forEach((job) => {
      listingStorage.removeListings(job.id);
      enhancedListingsStorage.deleteJobFile(job.id);
    });
  db.chain
    .get('jobs')
    .remove((job) => job.userId === userId)
    .value();
  db.write();
};

export const removeJobsByUserName = (userId) => {
  let removedDemoJobs = 0;
  db.chain
    .get('jobs')
    .filter((job) => job.userId === userId)
    .forEach((job) => {
      removedDemoJobs++;
      listingStorage.removeListings(job.id);
      enhancedListingsStorage.deleteJobFile(job.id);
    });
  db.chain
    .get('jobs')
    .remove((job) => job.userId === userId)
    .value();
  db.write();
  if (removedDemoJobs > 0) {
    /* eslint-disable no-console */
    console.log(`Removed ${removedDemoJobs} demo jobs`);
    /* eslint-enable no-console */
  }
};

export const getJobs = () => {
  return db.chain
    .get('jobs')
    .map((job) => ({
      ...job,
      numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id),
    }))
    .value();
};
