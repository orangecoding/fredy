import React from 'react';

import JobTable from '../../components/table/JobTable';
import { useSelector, useDispatch } from 'react-redux';
import { parseError, xhrDelete, xhrPut } from '#ui_services/xhr';
import { useHistory } from 'react-router-dom';
import ProcessingTimes from './ProcessingTimes';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import './Jobs.less';
import { RootState } from 'ui/src/types';
import { ApiDeleteJobReq, ApiSetJobStatusReq } from '#types/api.ts';

const Jobs: React.FC = () => {
  const jobs = useSelector((state: RootState) => state.jobs.jobs);
  const processingTimes = useSelector((state: RootState) => state.jobs.processingTimes);
  const history = useHistory();
  const dispatch = useDispatch();

  const onJobRemoval = async (jobId: string) => {
    xhrDelete<ApiDeleteJobReq>('/api/jobs', { jobId })
      .then(() => {
        Toast.success('Job successfully remove');
        dispatch.jobs.getJobs();
      })
      .catch((error) => {
        Toast.error(parseError(error));
      });
  };

  const onJobStatusChanged = async (jobId: string, enabled: boolean) => {
    xhrPut<ApiSetJobStatusReq>(`/api/jobs/${jobId}/status`, { status: enabled })
      .then(() => {
        Toast.success('Job status successfully changed');
        dispatch.jobs.getJobs();
      })
      .catch((error) => {
        Toast.error(parseError(error));
      });
  };

  return (
    <div>
      <div>
        {processingTimes != null && <ProcessingTimes processingTimes={processingTimes} />}
        <Button
          type="primary"
          icon={<IconPlusCircle />}
          className="jobs__newButton"
          onClick={() => history.push('/jobs/new')}
        >
          New Job
        </Button>
      </div>
      <JobTable
        jobs={jobs || []}
        onJobRemoval={onJobRemoval}
        onJobStatusChanged={onJobStatusChanged}
        onJobInsight={(jobId: string) => history.push(`/jobs/insights/${jobId}`)}
        onJobEdit={(jobId: string) => history.push(`/jobs/edit/${jobId}`)}
      />
    </div>
  );
};

export default Jobs;
