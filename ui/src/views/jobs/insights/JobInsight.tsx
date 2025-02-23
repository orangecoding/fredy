import React from 'react';

import { roundToNext5Minute } from '#ui_services/time/timeService';
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
import Linechart, { LinechartData } from './Linechart';
import { RootState } from '../../../services/rematch/store';
import { Listing } from '#types/Listings.ts';

interface JobInsightProps {
  jobId: string;
}
const JobInsight: React.FC<JobInsightProps> = ({ jobId }) => {
  const dispatch = useDispatch();
  const insights = useSelector((state: RootState) => state.jobs.insights);
  const jobs = useSelector((state: RootState) => state.jobs.jobs);

  React.useEffect(() => {
    dispatch.jobs.getInsightDataForJob(jobId);
    dispatch.jobs.getJobs();
  }, [dispatch, jobId]);

  const getData = () => {
    const data = insights[jobId] || {};

    const result: LinechartData[] = [];
    Object.keys(data).forEach((key) => {
      const series: LinechartData = {
        name: key[0].toUpperCase() + key.substring(1),
        data: [] as [number, number][],
      };

      const tmpTimeObj: Record<string, number> = {};

      Object.values(data[key as keyof Listing] || {}).forEach((listingTs) => {
        const time = roundToNext5Minute(listingTs as unknown as number);
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
    const job = jobs.find((job) => job.id === jobId);
    if (job == null) {
      return 'unknown';
    } else {
      return job.name;
    }
  };

  return (
    <div>
      <Headline text={`Insights into Job: ${getJobName()}`} />
      <Linechart isLoading={false} series={getData()} title={`Insights into Job: ${getJobName()}`} />
    </div>
  );
};

export default JobInsight;
