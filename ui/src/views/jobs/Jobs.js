import React from 'react';

import ToastContext from '../../components/toasts/ToastContext';
import JobTable from '../../components/table/JobTable';
import { useSelector, useDispatch } from 'react-redux';
import { xhrDelete, xhrPut } from '../../services/xhr';
import { Button, Icon } from 'semantic-ui-react';
import { useHistory } from 'react-router-dom';

import './Jobs.less';

export default function Jobs() {
  const jobs = useSelector((state) => state.jobs.jobs);
  const history = useHistory();
  const dispatch = useDispatch();
  const ctx = React.useContext(ToastContext);

  const onJobRemoval = async (jobId) => {
    try {
      await xhrDelete('/api/jobs', { jobId });
      ctx.showToast({
        title: 'Success',
        message: 'Job successfully remove',
        delay: 5000,
        backgroundColor: '#87eb8f',
        color: '#000',
      });
      await dispatch.jobs.getJobs();
    } catch (error) {
      ctx.showToast({
        title: 'Error',
        message: error,
        delay: 35000,
        backgroundColor: '#db2828',
        color: '#fff',
      });
    }
  };

  const onJobStatusChanged = async (jobId, status) => {
    try {
      await xhrPut(`/api/jobs/${jobId}/status`, { status });
      ctx.showToast({
        title: 'Success',
        message: 'Job status successfully changed',
        delay: 5000,
        backgroundColor: '#87eb8f',
        color: '#000',
      });
      await dispatch.jobs.getJobs();
    } catch (error) {
      ctx.showToast({
        title: 'Error',
        message: error,
        delay: 35000,
        backgroundColor: '#db2828',
        color: '#fff',
      });
    }
  };

  return (
    <div>
      <Button primary className="jobs__newButton" onClick={() => history.push('/jobs/new')}>
        <Icon name="plus" />
        New Job
      </Button>

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
