const path = require('path');
const DB_PATH = path.dirname(require.main.filename) + '/db/jobs.json';
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync(DB_PATH);
const low = require('lowdb');
const db = low(adapter);
const { nanoid } = require('nanoid');
const listingStorage = require('./listingsStorage');

db.defaults({ jobs: [] }).write();

exports.upsertJob = ({ jobId, name, blacklist = [], enabled = true, provider, notificationAdapter, userId }) => {
  const currentJob =
    jobId == null
      ? null
      : db
          .get('jobs')
          .find((job) => job.id === jobId)
          .value();

  const jobs = db
    .get('jobs')
    .value()
    .filter((job) => job.id !== jobId);

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

  db.set('jobs', jobs).write();
};

exports.getJob = (jobId) => {
  const job = db
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

exports.setJobStatus = ({ jobId, status }) => {
  db.get('jobs')
    .find((job) => job.id === jobId)
    .assign({ enabled: status })
    .write();
};

exports.removeJob = (jobId) => {
  db.get('jobs')
    .remove((job) => job.id === jobId)
    .write();
};

exports.removeJobsByUserId = (userId) => {
  db.get('jobs')
    .remove((job) => job.userId === userId)
    .write();
};

exports.getJobs = () => {
  return db
    .get('jobs')
    .value()
    .map((job) => ({
      ...job,
      numberOfFoundListings: listingStorage.getNumberOfAllKnownListings(job.id),
    }));
};
