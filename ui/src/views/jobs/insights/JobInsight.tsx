import React from 'react';

import { roundToNext5Minute } from '../../../services/time/timeService';
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router';
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

    const result = [];
    Object.keys(data).forEach((key) => {
      const series = {
        name: key[0].toUpperCase() + key.substring(1),
        data: [],
      };

      const tmpTimeObj = {};

      Object.values(data[key] || {}).forEach((listingTs) => {
        const time = roundToNext5Minute(listingTs);
        tmpTimeObj[time] = tmpTimeObj[time] == null ? 1 : tmpTimeObj[time] + 1;
      });

      Object.keys(tmpTimeObj)
        .sort()
        .forEach((timeKey) => {
          series.data.push([parseInt(timeKey), tmpTimeObj[timeKey]]);
        });
      result.push(series);
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
