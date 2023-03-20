import React from 'react';

import JobTable from '../../components/table/JobTable';
import { useSelector, useDispatch } from 'react-redux';
import { xhrDelete, xhrPut } from '../../services/xhr';
import { useHistory } from 'react-router-dom';
import ProcessingTimes from './ProcessingTimes';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import './Jobs.less';

export default function Jobs() {
  const jobs = useSelector((state) => state.jobs.jobs);
  const processingTimes = useSelector((state) => state.jobs.processingTimes);
  const history = useHistory();
  const dispatch = useDispatch();

  const onJobRemoval = async (jobId) => {
    try {
      await xhrDelete('/api/jobs', { jobId });
      Toast.success('Job successfully remove');
      await dispatch.jobs.getJobs();
    } catch (error) {
      Toast.error(error);
    }
  };

  const onJobStatusChanged = async (jobId, status) => {
    try {
      await xhrPut(`/api/jobs/${jobId}/status`, { status });
      Toast.success('Job status successfully changed');
      await dispatch.jobs.getJobs();
    } catch (error) {
      Toast.error(error);
    }
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
        onJobInsight={(jobId) => history.push(`/jobs/insights/${jobId}`)}
        onJobEdit={(jobId) => history.push(`/jobs/edit/${jobId}`)}
      />
    </div>
  );
}
