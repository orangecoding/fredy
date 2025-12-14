/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

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
      Toast.success('Job successfully removed');
      await actions.jobs.getJobs();
    } catch (error) {
      Toast.error(error);
    }
  };

  const onListingRemoval = async (jobId) => {
    try {
      await xhrDelete('/api/listings/job', { jobId });
      Toast.success('Listings successfully removed');
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
        onListingRemoval={onListingRemoval}
        onJobStatusChanged={onJobStatusChanged}
        onJobEdit={(jobId) => navigate(`/jobs/edit/${jobId}`)}
      />
    </div>
  );
}
