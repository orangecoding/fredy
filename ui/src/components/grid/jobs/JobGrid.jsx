/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Card,
  Col,
  Row,
  Button,
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
  Radio,
  RadioGroup,
} from '@douyinfe/semi-ui-19';
import {
  IconAlertTriangle,
  IconDelete,
  IconDescend2,
  IconEdit,
  IconCopy,
  IconPlayCircle,
  IconBriefcase,
  IconBell,
  IconSearch,
  IconPlusCircle,
  IconArrowUp,
  IconArrowDown,
  IconHome,
} from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';
import ListingDeletionModal from '../../ListingDeletionModal.jsx';
import { useActions, useSelector } from '../../../services/state/store.js';
import { xhrDelete, xhrPut, xhrPost } from '../../../services/xhr.js';
import { debounce } from '../../../utils';
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
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(null); // { type: 'job'|'listings', jobId }

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

  const onJobRemoval = (jobId) => {
    setPendingDeletion({ type: 'job', jobId });
    setDeleteModalVisible(true);
  };

  const onListingRemoval = (jobId) => {
    setPendingDeletion({ type: 'listings', jobId });
    setDeleteModalVisible(true);
  };

  const confirmDeletion = async (hardDelete) => {
    const { type, jobId } = pendingDeletion;
    try {
      if (type === 'job') {
        await xhrDelete('/api/jobs', { jobId });
        Toast.success('Job and listings successfully removed');
      } else if (type === 'listings') {
        await xhrDelete('/api/listings/job', { jobId, hardDelete });
        Toast.success('Listings successfully removed');
      }
      loadData();
      if (type === 'job') {
        actions.jobsData.getJobs(); // refresh select list too
      }
    } catch (error) {
      Toast.error(error.message || 'Error performing deletion');
    } finally {
      setDeleteModalVisible(false);
      setPendingDeletion(null);
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
      <div className="jobGrid__topbar">
        <Button type="primary" icon={<IconPlusCircle />} onClick={() => navigate('/jobs/new')}>
          New Job
        </Button>

        <Input
          className="jobGrid__topbar__search"
          prefix={<IconSearch />}
          showClear
          placeholder="Search"
          onChange={handleFilterChange}
        />

        <RadioGroup
          type="button"
          buttonSize="middle"
          value={activityFilter === null ? 'all' : String(activityFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setActivityFilter(v === 'all' ? null : v === 'true');
          }}
        >
          <Radio value="all">All</Radio>
          <Radio value="true">Active</Radio>
          <Radio value="false">Inactive</Radio>
        </RadioGroup>

        <Select prefix="Sort by" style={{ width: 200 }} value={sortField} onChange={(val) => setSortField(val)}>
          <Select.Option value="name">Name</Select.Option>
          <Select.Option value="numberOfFoundListings">Number of Listings</Select.Option>
          <Select.Option value="enabled">Status</Select.Option>
        </Select>

        <Button
          icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        />
      </div>

      {(jobsData?.result || []).length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description="No jobs available yet..."
        />
      )}

      <Row gutter={[16, 16]}>
        {(jobsData?.result || []).map((job) => (
          <Col key={job.id} xs={24} sm={12} md={12} lg={8} xl={8} xxl={6}>
            <Card className="jobGrid__card" bodyStyle={{ padding: '16px' }}>
              <div className="jobGrid__card__header">
                <div className="jobGrid__card__name">
                  <span className={`jobGrid__card__dot${job.enabled ? ' jobGrid__card__dot--active' : ''}`} />
                  <Title heading={5} ellipsis={{ showTooltip: true }} className="jobGrid__title">
                    {job.name}
                  </Title>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {job.isOnlyShared && (
                    <Popover
                      content={getPopoverContent(
                        'This job has been shared with you by another user, therefor it is read-only.',
                      )}
                    >
                      <div>
                        <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)' }} />
                      </div>
                    </Popover>
                  )}
                  {job.running && (
                    <Tag color="green" variant="light" size="small">
                      RUNNING
                    </Tag>
                  )}
                </div>
              </div>

              <div className="jobGrid__card__stats">
                <div className="jobGrid__card__stat jobGrid__card__stat--blue">
                  <span className="jobGrid__card__stat__number">{job.numberOfFoundListings || 0}</span>
                  <span className="jobGrid__card__stat__label">
                    <IconHome size="small" /> Listings
                  </span>
                </div>
                <div className="jobGrid__card__stat jobGrid__card__stat--orange">
                  <span className="jobGrid__card__stat__number">{job.provider.length || 0}</span>
                  <span className="jobGrid__card__stat__label">
                    <IconBriefcase size="small" /> Providers
                  </span>
                </div>
                <div className="jobGrid__card__stat jobGrid__card__stat--purple">
                  <span className="jobGrid__card__stat__number">{job.notificationAdapter.length || 0}</span>
                  <span className="jobGrid__card__stat__label">
                    <IconBell size="small" /> Adapters
                  </span>
                </div>
              </div>

              <Divider margin="12px" />

              <div className="jobGrid__card__footer">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Switch
                    onChange={(checked) => onJobStatusChanged(job.id, checked)}
                    checked={job.enabled}
                    disabled={job.isOnlyShared}
                    size="small"
                  />
                  <Text type="secondary" size="small">
                    Active
                  </Text>
                </div>
                <div className="jobGrid__actions">
                  <Popover content={getPopoverContent('Run Job')}>
                    <div>
                      <Button
                        type="primary"
                        style={{ background: '#21aa21b5' }}
                        size="small"
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
                        size="small"
                        icon={<IconEdit />}
                        disabled={job.isOnlyShared}
                        onClick={() => navigate(`/jobs/edit/${job.id}`)}
                      />
                    </div>
                  </Popover>
                  <Popover content={getPopoverContent('Clone Job')}>
                    <div>
                      <Button
                        type="tertiary"
                        size="small"
                        icon={<IconCopy />}
                        disabled={job.isOnlyShared}
                        onClick={() => navigate('/jobs/new', { state: { cloneFrom: job.id } })}
                      />
                    </div>
                  </Popover>
                  <Popover content={getPopoverContent('Delete all found Listings of this Job')}>
                    <div>
                      <Button
                        type="danger"
                        size="small"
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
                        size="small"
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
      <ListingDeletionModal
        visible={deleteModalVisible}
        title={pendingDeletion?.type === 'job' ? 'Delete Job' : 'Delete Listings'}
        showOptions={pendingDeletion?.type !== 'job'}
        message={
          pendingDeletion?.type === 'job'
            ? 'Are you sure you want to delete this job? All associated listings will be removed from the database.'
            : 'How would you like to delete the selected listing(s)?'
        }
        onConfirm={confirmDeletion}
        onCancel={() => {
          setDeleteModalVisible(false);
          setPendingDeletion(null);
        }}
      />
    </div>
  );
};

export default JobGrid;
