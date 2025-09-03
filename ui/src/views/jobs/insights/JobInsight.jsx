import React from 'react';

import { roundToNext5Minute } from '../../../services/time/timeService';
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import Linechart from './Linechart';

const JobInsight = function JobInsight() {
  const dispatch = useDispatch();

  const insights = useSelector((state) => state.jobs.insights);
  const jobs = useSelector((state) => state.jobs.jobs);
  const params = useParams();

  React.useEffect(() => {
    dispatch.jobs.getInsightDataForJob(params.jobId);
    dispatch.jobs.getJobs();
  }, []);

  const getData = () => {
    const data = insights[params.jobId] || {};
    const providers = Object.keys(data);

    const countsByProvider = {};
    const allTimes = new Set();

    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : 'Unknown');
    const toDate = (ts) => new Date(ts < 1e12 ? ts * 1000 : ts); // seconds vs ms

    providers.forEach((key) => {
      const providerName = cap(key);
      const tmpTimeObj = {};

      Object.values(data[key] || {}).forEach((listingTs) => {
        const time = roundToNext5Minute(listingTs);
        tmpTimeObj[time] = tmpTimeObj[time] == null ? 1 : tmpTimeObj[time] + 1;
        allTimes.add(time);
      });

      countsByProvider[providerName] = tmpTimeObj;
    });

    const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

    const result = [];
    providers.forEach((key) => {
      const providerName = cap(key);
      const bucket = countsByProvider[providerName] || {};

      sortedTimes.forEach((t) => {
        result.push({
          listings: Number(t), // Date object for time axis
          listingsNumber: bucket[t] || 0, // y value
          provider: providerName, // series key
        });
      });
    });

    console.log(result);

    return result;
  };

  const getJobName = () => {
    const job = jobs.find((job) => job.id === params.jobId);
    if (job == null) {
      return 'unknown';
    } else {
      return job.name;
    }
  };

  return (
    <div>
      <Headline text={`Insights into Job: ${getJobName()}`} />
      <Linechart isLoading={false} series={getData()} />
    </div>
  );
};

export default JobInsight;
