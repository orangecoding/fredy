import React from 'react';

import { roundToHour } from '../../../services/time/timeService';
import Headline from '../../../components/headline/Headline';
import { useActions, useSelector } from '../../../services/state/store';
import { useParams } from 'react-router-dom';
import Linechart from './Linechart';

const JobInsight = function JobInsight() {
  const actions = useActions();

  const insights = useSelector((state) => state.jobs.insights);
  const jobs = useSelector((state) => state.jobs.jobs);
  const params = useParams();

  React.useEffect(() => {
    actions.jobs.getInsightDataForJob(params.jobId);
    actions.jobs.getJobs();
  }, []);

  const getData = () => {
    const data = insights[params.jobId] || {};
    const providers = Object.keys(data);

    const countsByProvider = {};
    const allTimes = new Set();

    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : 'Unknown');

    providers.forEach((key) => {
      const providerName = cap(key);
      const tmpTimeObj = {};

      Object.values(data[key] || {}).forEach((listingTs) => {
        const time = roundToHour(listingTs);
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
          listings: new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(parseInt(t))),
          listingsNumber: bucket[t] || 0, // y value
          provider: providerName, // series key
        });
      });
    });

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
