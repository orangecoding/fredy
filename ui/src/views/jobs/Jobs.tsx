// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

// @ts-expect-error TS(6142): Module '../../components/table/JobTable' was resol... Remove this comment to see the full error message
import JobTable from '../../components/table/JobTable';
import { useSelector, useDispatch } from 'react-redux';
import { xhrDelete, xhrPut } from '../../services/xhr';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useHistory } from 'react-router-dom';
// @ts-expect-error TS(6142): Module './ProcessingTimes' was resolved to 'C:/Pro... Remove this comment to see the full error message
import ProcessingTimes from './ProcessingTimes';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import './Jobs.less';

export default function Jobs() {
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const jobs = useSelector((state) => state.jobs.jobs);
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const processingTimes = useSelector((state) => state.jobs.processingTimes);
  const history = useHistory();
  const dispatch = useDispatch();

  const onJobRemoval = async (jobId: any) => {
    try {
      await xhrDelete('/api/jobs', { jobId });
      Toast.success('Job successfully remove');
      await dispatch.jobs.getJobs();
    } catch (error) {
      // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
      Toast.error(error);
    }
  };

  const onJobStatusChanged = async (jobId: any, status: any) => {
    try {
      await xhrPut(`/api/jobs/${jobId}/status`, { status });
      Toast.success('Job status successfully changed');
      await dispatch.jobs.getJobs();
    } catch (error) {
      // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
      Toast.error(error);
    }
  };

  return (
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    <div>
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <div>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        {processingTimes != null && <ProcessingTimes processingTimes={processingTimes} />}
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Button
          type="primary"
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          icon={<IconPlusCircle />}
          className="jobs__newButton"
          onClick={() => history.push('/jobs/new')}
        >
          New Job
        </Button>
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      </div>

      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <JobTable
        jobs={jobs || []}
        onJobRemoval={onJobRemoval}
        onJobStatusChanged={onJobStatusChanged}
        onJobInsight={(jobId: any) => history.push(`/jobs/insights/${jobId}`)}
        onJobEdit={(jobId: any) => history.push(`/jobs/edit/${jobId}`)}
      />
    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
    </div>
  );
}
