// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { roundToNext5Minute } from '../../../services/time/timeService';
// @ts-expect-error TS(6142): Module '../../../components/headline/Headline' was... Remove this comment to see the full error message
import Headline from '../../../components/headline/Headline';
import { useDispatch, useSelector } from 'react-redux';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useParams } from 'react-router';
// @ts-expect-error TS(6142): Module './Linechart' was resolved to 'C:/Programmi... Remove this comment to see the full error message
import Linechart from './Linechart';

const JobInsight = function JobInsight() {
  const dispatch = useDispatch();

  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const insights = useSelector((state) => state.jobs.insights);
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const jobs = useSelector((state) => state.jobs.jobs);
  const params = useParams();

  React.useEffect(() => {
    dispatch.jobs.getInsightDataForJob(params.jobId);
    dispatch.jobs.getJobs();
  }, []);

  const getData = () => {
    const data = insights[params.jobId] || {};

    const result: any = [];
    Object.keys(data).forEach((key) => {
      const series = {
        name: key[0].toUpperCase() + key.substring(1),
        data: [],
      };

      const tmpTimeObj = {};

      Object.values(data[key] || {}).forEach((listingTs) => {
        const time = roundToNext5Minute(listingTs);
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        tmpTimeObj[time] = tmpTimeObj[time] == null ? 1 : tmpTimeObj[time] + 1;
      });

      Object.keys(tmpTimeObj)
        .sort()
        .forEach((timeKey) => {
          // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'never'.
          series.data.push([parseInt(timeKey), tmpTimeObj[timeKey]]);
        });
      result.push(series);
    });

    return result;
  };

  const getJobName = () => {
    const job = jobs.find((job: any) => job.id === params.jobId);
    if (job == null) {
      return 'unknown';
    } else {
      return job.name;
    }
  };

  return (
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    <div>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Headline text={`Insights into Job: ${getJobName()}`} />
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Linechart isLoading={false} series={getData()} />
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    </div>
  );
};

export default JobInsight;
