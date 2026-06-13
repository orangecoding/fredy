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
  Tooltip,
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
  IconArrowUp,
  IconArrowDown,
  IconHome,
  IconGridView,
  IconList,
} from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';
import ListingDeletionModal from '../../ListingDeletionModal.jsx';
import { useActions, useSelector } from '../../../services/state/store.js';
import { xhrDelete, xhrPut, xhrPost } from '../../../services/xhr.js';
import { debounce } from '../../../utils';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import JobsTable from '../../table/JobsTable.jsx';

import './JobGrid.less';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

const { Text, Title } = Typography;

const getPopoverContent = (text) => <article className="jobPopoverContent">{text}</article>;

const JobGrid = () => {
  const t = useTranslation();
  const jobsData = useSelector((state) => state.jobsData);
  const actions = useActions();
  const navigate = useNavigate();

  const userSettings = useSelector((state) => state.userSettings.settings);
  const viewMode = userSettings?.jobs_view_mode ?? 'grid';
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

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
            Toast.success(t('jobs.toastFinished'));
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
    const deletion = { type: 'listings', jobId };
    if (listingDeletionPref?.skipPrompt) {
      confirmDeletion(listingDeletionPref.hardDelete, false, deletion);
      return;
    }
    setPendingDeletion(deletion);
    setDeleteModalVisible(true);
  };

  const confirmDeletion = async (hardDelete, remember, deletion = pendingDeletion) => {
    const { type, jobId } = deletion;
    try {
      if (remember && type === 'listings') {
        await actions.userSettings.setListingDeletionPreference({ skipPrompt: true, hardDelete });
      }
      if (type === 'job') {
        await xhrDelete('/api/jobs', { jobId });
        Toast.success(t('jobs.toastDeletedWithListings'));
      } else if (type === 'listings') {
        await xhrDelete('/api/listings/job', { jobId, hardDelete });
        Toast.success(t('jobs.toastListingsDeleted'));
      }
      loadData();
      if (type === 'job') {
        actions.jobsData.getJobs(); // refresh select list too
      }
    } catch (error) {
      Toast.error(error.message || t('jobs.toastDeleteError'));
    } finally {
      setDeleteModalVisible(false);
      setPendingDeletion(null);
    }
  };

  const onJobStatusChanged = async (jobId, status) => {
    try {
      await xhrPut(`/api/jobs/${jobId}/status`, { status });
      Toast.success(t('jobs.toastStatusChanged'));
      loadData();
      actions.jobsData.getJobs(); // refresh the jobs slice read by the edit form so its switch isn't stale
    } catch (error) {
      Toast.error(error.error);
    }
  };

  const onJobRun = async (jobId) => {
    try {
      const response = await xhrPost(`/api/jobs/${jobId}/run`);
      if (response.status === 202) {
        Toast.success(t('jobs.toastRunStarted'));
      } else {
        Toast.info(t('jobs.toastRunRequested'));
      }
      pendingJobIdRef.current = jobId;
      loadData();
    } catch (error) {
      if (error?.status === 409) {
        Toast.warning(error?.json?.message || t('jobs.toastAlreadyRunning'));
      } else if (error?.status === 403) {
        Toast.error(t('jobs.toastNotAllowed'));
      } else if (error?.status === 404) {
        Toast.error(t('jobs.toastNotFound'));
      } else {
        Toast.error(t('jobs.toastRunFailed'));
      }
    }
  };

  const handlePageChange = (_page) => {
    setPage(_page);
  };

  return (
    <div className="jobGrid">
      <div className="jobGrid__topbar">
        <Input
          className="jobGrid__topbar__search"
          prefix={<IconSearch />}
          showClear
          placeholder={t('jobs.searchPlaceholder')}
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
          <Radio value="all">{t('jobs.filterAll')}</Radio>
          <Radio value="true">{t('jobs.filterActive')}</Radio>
          <Radio value="false">{t('jobs.filterInactive')}</Radio>
        </RadioGroup>

        <Select
          prefix={t('jobs.sortPrefix')}
          style={{ width: 200 }}
          value={sortField}
          onChange={(val) => setSortField(val)}
        >
          <Select.Option value="name">{t('jobs.sortByName')}</Select.Option>
          <Select.Option value="numberOfFoundListings">{t('jobs.sortByListings')}</Select.Option>
          <Select.Option value="enabled">{t('jobs.sortByStatus')}</Select.Option>
        </Select>

        <Button
          icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? t('jobs.sortAscending') : t('jobs.sortDescending')}
        />

        <div className="jobGrid__topbar__view-toggle">
          <Tooltip content={t('jobs.tooltipGridView')}>
            <Button
              icon={<IconGridView />}
              theme={viewMode === 'grid' ? 'solid' : 'borderless'}
              onClick={() => actions.userSettings.setJobsViewMode('grid')}
              aria-label={t('common.ariaGridView')}
              aria-pressed={viewMode === 'grid'}
            />
          </Tooltip>
          <Tooltip content={t('jobs.tooltipTableView')}>
            <Button
              icon={<IconList />}
              theme={viewMode === 'table' ? 'solid' : 'borderless'}
              onClick={() => actions.userSettings.setJobsViewMode('table')}
              aria-label={t('common.ariaTableView')}
              aria-pressed={viewMode === 'table'}
            />
          </Tooltip>
        </div>
      </div>

      {(jobsData?.result || []).length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description={t('jobs.empty')}
        />
      )}

      {viewMode === 'grid' ? (
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
                      <Popover content={getPopoverContent(t('jobs.cardSharedReadOnly'))}>
                        <div>
                          <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)' }} />
                        </div>
                      </Popover>
                    )}
                    {job.running && (
                      <Tag color="green" variant="light" size="small">
                        {t('jobs.cardRunning')}
                      </Tag>
                    )}
                  </div>
                </div>

                <div className="jobGrid__card__stats">
                  <div className="jobGrid__card__stat jobGrid__card__stat--blue">
                    <span className="jobGrid__card__stat__number">{job.numberOfFoundListings || 0}</span>
                    <span className="jobGrid__card__stat__label">
                      <IconHome size="small" /> {t('jobs.cardListings')}
                    </span>
                  </div>
                  <div className="jobGrid__card__stat jobGrid__card__stat--orange">
                    <span className="jobGrid__card__stat__number">{job.provider?.length || 0}</span>
                    <span className="jobGrid__card__stat__label">
                      <IconBriefcase size="small" /> {t('jobs.cardProviders')}
                    </span>
                  </div>
                  <div className="jobGrid__card__stat jobGrid__card__stat--purple">
                    <span className="jobGrid__card__stat__number">{job.notificationAdapter?.length || 0}</span>
                    <span className="jobGrid__card__stat__label">
                      <IconBell size="small" /> {t('jobs.cardAdapters')}
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
                      {t('jobs.cardActive')}
                    </Text>
                  </div>
                  <div className="jobGrid__actions">
                    <Popover content={getPopoverContent(t('jobs.popoverRunJob'))}>
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
                    <Popover content={getPopoverContent(t('jobs.popoverEditJob'))}>
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
                    <Popover content={getPopoverContent(t('jobs.popoverCloneJob'))}>
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
                    <Popover content={getPopoverContent(t('jobs.popoverDeleteListings'))}>
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
                    <Popover content={getPopoverContent(t('jobs.popoverDeleteJob'))}>
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
      ) : (
        <JobsTable
          jobs={jobsData?.result || []}
          onRun={onJobRun}
          onEdit={(id) => navigate(`/jobs/edit/${id}`)}
          onClone={(id) => navigate('/jobs/new', { state: { cloneFrom: id } })}
          onDeleteListings={onListingRemoval}
          onDeleteJob={onJobRemoval}
          onStatusChange={onJobStatusChanged}
        />
      )}
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
        title={pendingDeletion?.type === 'job' ? t('jobs.deletion.title') : t('listing.deletion.title')}
        showOptions={pendingDeletion?.type !== 'job'}
        defaultDeleteType={defaultDeleteType}
        message={pendingDeletion?.type === 'job' ? t('jobs.deletion.message') : t('listing.deletion.message')}
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
