/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card,
  Col,
  Row,
  Button,
  Space,
  Typography,
  Divider,
  Switch,
  Popover,
  Tag,
  Input,
  Select,
  Pagination,
  Toast,
  Empty,
} from '@douyinfe/semi-ui-19';
import {
  IconAlertTriangle,
  IconDelete,
  IconDescend2,
  IconEdit,
  IconPlayCircle,
  IconBriefcase,
  IconBell,
  IconSearch,
  IconFilter,
  IconPlusCircle,
} from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';
import { useActions, useSelector } from '../../../services/state/store.js';
import { xhrDelete, xhrPut, xhrPost } from '../../../services/xhr.js';
import debounce from 'lodash/debounce';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

import './JobGrid.less';

const { Text, Title } = Typography;

const getPopoverContent = (text) => <article className="jobPopoverContent">{text}</article>;

const JobGrid = () => {
  const jobsData = useSelector((state) => state.jobsData);
  const actions = useActions();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [freeTextFilter, setFreeTextFilter] = useState(null);
  const [activityFilter, setActivityFilter] = useState(null);
  const [showFilterBar, setShowFilterBar] = useState(false);

  const pendingJobIdRef = useRef(null);
  const evtSourceRef = useRef(null);

  const loadData = () => {
    actions.jobsData.getJobsData({
      page,
      pageSize,
      sortfield: sortField,
      sortdir: sortDir,
      freeTextFilter,
      filter: { activityFilter },
    });
  };

  useEffect(() => {
    loadData();
  }, [page, sortField, sortDir, freeTextFilter, activityFilter]);

  // SSE connection for live job status updates
  useEffect(() => {
    // establish SSE connection
    const src = new EventSource('/api/jobs/events');
    evtSourceRef.current = src;

    const onJobStatus = (e) => {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data && data.jobId) {
          actions.jobsData.setJobRunning(data.jobId, !!data.running);
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
      // Let browser auto-reconnect
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
  }, [actions.jobsData]);

  const handleFilterChange = useMemo(() => debounce((value) => setFreeTextFilter(value), 500), []);

  useEffect(() => {
    return () => {
      handleFilterChange.cancel && handleFilterChange.cancel();
    };
  }, [handleFilterChange]);

  const onJobRemoval = async (jobId) => {
    try {
      await xhrDelete('/api/jobs', { jobId });
      Toast.success('Job successfully removed');
      loadData();
      actions.jobsData.getJobs(); // refresh select list too
    } catch (error) {
      Toast.error(error);
    }
  };

  const onListingRemoval = async (jobId) => {
    try {
      await xhrDelete('/api/listings/job', { jobId });
      Toast.success('Listings successfully removed');
      loadData();
    } catch (error) {
      Toast.error(error);
    }
  };

  const onJobStatusChanged = async (jobId, status) => {
    try {
      await xhrPut(`/api/jobs/${jobId}/status`, { status });
      Toast.success('Job status successfully changed');
      loadData();
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
      pendingJobIdRef.current = jobId;
      loadData();
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

  const handlePageChange = (_page) => {
    setPage(_page);
  };

  return (
    <div className="jobGrid">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Button
          style={{ width: '7rem', margin: 0 }}
          type="primary"
          icon={<IconPlusCircle />}
          className="jobs__newButton"
          onClick={() => navigate('/jobs/new')}
        >
          New Job
        </Button>

        <div className="jobGrid__searchbar">
          <Input prefix={<IconSearch />} showClear placeholder="Search" onChange={handleFilterChange} />
          <Popover content="Filter / Sort Results" style={{ color: 'white', padding: '.5rem' }}>
            <div>
              <Button
                icon={<IconFilter />}
                onClick={() => {
                  setShowFilterBar(!showFilterBar);
                }}
              />
            </div>
          </Popover>
        </div>
      </div>

      {showFilterBar && (
        <div className="jobGrid__toolbar">
          <Space wrap style={{ marginBottom: '1rem' }}>
            <div className="jobGrid__toolbar__card">
              <div>
                <Text strong>Filter by:</Text>
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <Select
                  placeholder="Status"
                  showClear
                  onChange={(val) => setActivityFilter(val)}
                  value={activityFilter}
                  style={{ width: 140 }}
                >
                  <Select.Option value={true}>Active</Select.Option>
                  <Select.Option value={false}>Not Active</Select.Option>
                </Select>
              </div>
            </div>
            <Divider layout="vertical" />
            <div className="jobGrid__toolbar__card">
              <div>
                <Text strong>Sort by:</Text>
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <Select
                  placeholder="Sort By"
                  style={{ width: 160 }}
                  value={sortField}
                  onChange={(val) => setSortField(val)}
                >
                  <Select.Option value="name">Name</Select.Option>
                  <Select.Option value="numberOfFoundListings">Number of Listings</Select.Option>
                  <Select.Option value="enabled">Status</Select.Option>
                </Select>

                <Select
                  placeholder="Direction"
                  style={{ width: 120 }}
                  value={sortDir}
                  onChange={(val) => setSortDir(val)}
                >
                  <Select.Option value="asc">Ascending</Select.Option>
                  <Select.Option value="desc">Descending</Select.Option>
                </Select>
              </div>
            </div>
          </Space>
        </div>
      )}

      {(jobsData?.result || []).length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description="No jobs available yet..."
        />
      )}

      <Row gutter={[16, 16]}>
        {(jobsData?.result || []).map((job) => (
          <Col key={job.id} xs={24} sm={12} md={8} lg={6} xl={4} xxl={6}>
            <Card
              className="jobGrid__card"
              bodyStyle={{ padding: '16px' }}
              headerLine={true}
              title={
                <div className="jobGrid__header">
                  <Title heading={5} ellipsis={{ showTooltip: true }} className="jobGrid__title">
                    {job.name}
                  </Title>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {job.isOnlyShared && (
                      <Popover
                        content={getPopoverContent(
                          'This job has been shared with you by another user, therefor it is read-only.',
                        )}
                      >
                        <div>
                          <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)', marginLeft: '8px' }} />
                        </div>
                      </Popover>
                    )}
                  </div>
                  {job.running && (
                    <Tag color="green" variant="light" size="small">
                      RUNNING
                    </Tag>
                  )}
                </div>
              }
            >
              <div className="jobGrid__content">
                <Space vertical align="start" spacing={4} style={{ width: '100%', marginTop: 12 }}>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconSearch />} size="small">
                      Is active:
                    </Text>
                    <Switch
                      onChange={(checked) => onJobStatusChanged(job.id, checked)}
                      style={{ marginLeft: 'auto' }}
                      checked={job.enabled}
                      disabled={job.isOnlyShared}
                      size="small"
                    />
                  </div>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconSearch />} size="small">
                      Listings:
                    </Text>
                    <Tag color="blue" size="small" style={{ marginLeft: 'auto' }}>
                      {job.numberOfFoundListings || 0}
                    </Tag>
                  </div>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconBriefcase />} size="small">
                      Providers:
                    </Text>
                    <Tag color="cyan" size="small" style={{ marginLeft: 'auto' }}>
                      {job.provider.length || 0}
                    </Tag>
                  </div>
                  <div className="jobGrid__infoItem">
                    <Text type="secondary" icon={<IconBell />} size="small">
                      Adapters:
                    </Text>
                    <Tag color="purple" size="small" style={{ marginLeft: 'auto' }}>
                      {job.notificationAdapter.length || 0}
                    </Tag>
                  </div>
                </Space>

                <Divider margin="12px" />

                <div className="jobGrid__actions">
                  <Popover content={getPopoverContent('Run Job')}>
                    <div>
                      <Button
                        type="primary"
                        theme="solid"
                        icon={<IconPlayCircle />}
                        disabled={job.isOnlyShared || job.running}
                        onClick={() => onJobRun(job.id)}
                      />
                    </div>
                  </Popover>
                  <Popover content={getPopoverContent('Edit a Job')}>
                    <div>
                      <Button
                        type="secondary"
                        theme="solid"
                        icon={<IconEdit />}
                        disabled={job.isOnlyShared}
                        onClick={() => navigate(`/jobs/edit/${job.id}`)}
                      />
                    </div>
                  </Popover>
                  <Popover content={getPopoverContent('Delete all found Listings of this Job')}>
                    <div>
                      <Button
                        type="danger"
                        theme="solid"
                        icon={<IconDescend2 />}
                        disabled={job.isOnlyShared}
                        onClick={() => onListingRemoval(job.id)}
                      />
                    </div>
                  </Popover>
                  <Popover content={getPopoverContent('Delete Job')}>
                    <div>
                      <Button
                        type="danger"
                        theme="solid"
                        icon={<IconDelete />}
                        disabled={job.isOnlyShared}
                        onClick={() => onJobRemoval(job.id)}
                      />
                    </div>
                  </Popover>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      {(jobsData?.result || []).length > 0 && jobsData?.totalNumber > 12 && (
        <div className="jobGrid__pagination">
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={jobsData?.totalNumber || 0}
            onPageChange={handlePageChange}
            showSizeChanger={false}
          />
        </div>
      )}
    </div>
  );
};

export default JobGrid;
