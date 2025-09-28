import React from 'react';

import JobTable from '../../components/table/JobTable';
import { useSelector, useActions } from '../../services/state/store';
import { xhrDelete, xhrPut } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import './Jobs.less';

export default function Jobs() {
  const jobs = useSelector((state) => state.jobs.jobs);
  const navigate = useNavigate();
  const actions = useActions();

  const onJobRemoval = async (jobId) => {
    try {
      await xhrDelete('/api/jobs', { jobId });
      Toast.success('Job successfully remove');
      await actions.jobs.getJobs();
    } catch (error) {
      Toast.error(error);
    }
  };

  const onJobStatusChanged = async (jobId, status) => {
    try {
      await xhrPut(`/api/jobs/${jobId}/status`, { status });
      Toast.success('Job status successfully changed');
      await actions.jobs.getJobs();
    } catch (error) {
      Toast.error(error);
    }
  };

  return (
    <div>
      <div>
        <Button
          type="primary"
          icon={<IconPlusCircle />}
          className="jobs__newButton"
          onClick={() => navigate('/jobs/new')}
        >
          New Job
        </Button>
      </div>

      <JobTable
        jobs={jobs || []}
        onJobRemoval={onJobRemoval}
        onJobStatusChanged={onJobStatusChanged}
        onJobInsight={(jobId) => navigate(`/jobs/insights/${jobId}`)}
        onJobEdit={(jobId) => navigate(`/jobs/edit/${jobId}`)}
      />
    </div>
  );
}
