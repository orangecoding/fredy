/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import JobTable from '../../components/table/JobTable';
import { useSelector, useActions } from '../../services/state/store';
import { xhrDelete, xhrPut, xhrPost } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import { Button, Toast } from '@douyinfe/semi-ui';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import './Jobs.less';

export default function Jobs() {
  const jobs = useSelector((state) => state.jobs.jobs);
  const navigate = useNavigate();
  const actions = useActions();
  const pendingJobIdRef = React.useRef(null);
  const evtSourceRef = React.useRef(null);

  // SSE connection for live job status updates
  React.useEffect(() => {
    // establish SSE connection
    const src = new EventSource('/api/jobs/events');
    evtSourceRef.current = src;

    const onJobStatus = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && data.jobId) {
          actions.jobs.setJobRunning(data.jobId, !!data.running);
          // notify finish if it was triggered by this view
          if (pendingJobIdRef.current === data.jobId && data.running === false) {
            Toast.success('Job finished');
            pendingJobIdRef.current = null;
          }
        }
      } catch {
        // ignore malformed events
      }
    };

    src.addEventListener('jobStatus', onJobStatus);
    src.onerror = () => {
      // Let browser auto-reconnect; optionally log
    };

    return () => {
      try {
        src.removeEventListener('jobStatus', onJobStatus);
        src.close();
      } catch {
        //noop
      }
      evtSourceRef.current = null;
      pendingJobIdRef.current = null;
    };
  }, [actions.jobs]);

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

  const onJobRun = async (jobId) => {
    try {
      const response = await xhrPost(`/api/jobs/${jobId}/run`);
      if (response.status === 202) {
        Toast.success('Job run started');
      } else {
        Toast.info('Job run requested');
      }
      // remember so we can show a finish toast when SSE says it's done
      pendingJobIdRef.current = jobId;
      // optional: one initial refresh in case SSE arrives late
      await actions.jobs.getJobs();
    } catch (error) {
      if (error?.status === 409) {
        Toast.warning(error?.json?.message || 'Job is already running');
      } else if (error?.status === 403) {
        Toast.error('You are not allowed to run this job');
      } else if (error?.status === 404) {
        Toast.error('Job not found');
      } else {
        Toast.error('Failed to trigger job');
      }
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
        onJobRun={onJobRun}
        onJobEdit={(jobId) => navigate(`/jobs/edit/${jobId}`)}
      />
    </div>
  );
}
