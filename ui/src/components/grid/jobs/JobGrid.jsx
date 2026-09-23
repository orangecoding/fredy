/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Switch,
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
  IconSearch,
  IconArrowUp,
  IconArrowDown,
  IconGridView,
  IconList,
} from '@douyinfe/semi-icons';
import { useNavigate, useSearchParams } from 'react-router';
import ListingDeletionModal from '../../ListingDeletionModal.jsx';
import FilterButton from '../../filters/FilterButton.jsx';
import ActiveFilterChips from '../../filters/ActiveFilterChips.jsx';
import FilterDrawer, { FilterGroup, FilterHelp } from '../../filters/FilterDrawer.jsx';
import {
  countActiveFilters,
  describeActiveFilters,
  clearFilter,
  clearAllFilters,
} from '../../../services/jobs/jobFilters.js';
import { useUrlState, parseNumber, parseString, parseNullableBoolean } from '../../../hooks/useSearchParamState.js';
import { useActions, useSelector } from '../../../services/state/store.js';
import { xhrDelete, xhrPut, xhrPost, errorMessage } from '../../../services/xhr.js';
import { debounce } from '../../../utils';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import JobsTable from '../../table/JobsTable.jsx';
import JobActions from '../../jobs/JobActions.jsx';
import { relativeTime } from '../../../services/time/relativeTime.js';

import './JobGrid.less';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

/**
 * The page's filters, sort and pagination live in the URL rather than in component state.
 *
 * Opening a job and coming back used to land on page one with every filter cleared, because the
 * state died with the component. In the URL it survives the round trip, the back button, a reload
 * and a shared link - the same deal the listings page already makes, so the two pages behave alike.
 *
 * Module scope because `useUrlState` needs a schema that is stable across renders.
 *
 * @type {Record<string, {defaultValue: *, codec: {parse: Function, stringify: Function}}>}
 */
const JOBS_URL_STATE = {
  page: { defaultValue: 1, codec: parseNumber },
  sort: { defaultValue: 'name', codec: parseString },
  dir: { defaultValue: 'asc', codec: parseString },
  q: { defaultValue: null, codec: parseString },
  active: { defaultValue: null, codec: parseNullableBoolean },
};

const JobGrid = () => {
  const t = useTranslation();
  const jobsData = useSelector((state) => state.jobsData);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();

  const userSettings = useSelector((state) => state.userSettings.settings);
  const viewMode = userSettings?.jobs_view_mode ?? 'grid';
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

  const pageSize = 12;

  // One piece of state for the whole group: every control here writes its own param plus the page
  // reset, and separate per-key setters would race each other into the URL.
  const { values: filterValues, setValue, setValues } = useUrlState(sp, JOBS_URL_STATE);
  const { page, sort: sortField, dir: sortDir, q: freeTextFilter, active: activityFilter } = filterValues;

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(null); // { type: 'job'|'listings', jobId }
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The same filter model the listings page uses, so the two pages behave identically rather than
  // one hiding its filters behind a button while the other spreads them across the top. The patches
  // the shared helpers return are keyed the same way as the URL state, so they apply as they are.
  const activeFilterCount = countActiveFilters(filterValues);

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

  // The SSE subscription is set up once, so a `loadData` captured inside it would keep querying
  // the page and sort order that happened to be active at mount. Reading it through a ref means
  // the refresh always uses the filters on screen right now.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    loadData();
  }, [page, sortField, sortDir, freeTextFilter, activityFilter]);

  // Deleting the only job on the last page leaves that page empty, and the pager only draws while
  // there are rows: the user was left looking at "no jobs yet" with jobs to show. Back to the last
  // page that has any.
  useEffect(() => {
    const total = jobsData?.totalNumber ?? 0;
    if (page > 1 && total > 0 && (jobsData?.result ?? []).length === 0) {
      setValue('page', Math.max(1, Math.ceil(total / pageSize)));
    }
  }, [jobsData, page]);

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
          if (data.running === false) {
            // A finished run is exactly when the listing count changed. Without this the grid
            // keeps showing the count from before the run - typically 0 on a brand new job -
            // until the user reloads the page and wonders whether the run did anything.
            loadDataRef.current();
            // notify finish if it was triggered by this view
            if (pendingJobIdRef.current === data.jobId) {
              Toast.success(t('jobs.toastFinished'));
              pendingJobIdRef.current = null;
            }
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

  const handleFilterChange = useMemo(
    () =>
      debounce((value) => {
        setValues({ q: value || null, page: 1 });
      }, 500),
    [],
  );

  useEffect(() => {
    return () => {
      handleFilterChange.cancel?.();
    };
  }, [handleFilterChange]);

  const onJobRemoval = (jobId) => {
    setPendingDeletion({ type: 'job', jobId });
    setDeleteModalVisible(true);
  };

  // The store re-throws so a caller can react. These two buttons had no catch at all, so a
  // refused write (a 403 on a locked-down instance) became an unhandled rejection: the toggle
  // silently snapped back and nothing said why.
  const switchViewMode = (mode) => {
    actions.userSettings.setJobsViewMode(mode).catch((error) => {
      Toast.error(errorMessage(error, t('common.settingSaveError')));
    });
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
      Toast.error(errorMessage(error, t('jobs.toastDeleteError')));
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
      // The rejection is `{ status, json }` - `error.error` was always undefined, so flipping the
      // switch on a job the backend refuses (the demo job, most visibly) produced an empty toast
      // and looked like the click had simply not registered.
      Toast.error(errorMessage(error, t('jobs.toastStatusChangeError')));
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
    setValue('page', _page);
  };

  return (
    <div className="jobGrid">
      <div className="jobGrid__topbar">
        <Input
          className="jobGrid__topbar__search"
          prefix={<IconSearch />}
          showClear
          placeholder={t('jobs.searchPlaceholder')}
          defaultValue={freeTextFilter ?? ''}
          onChange={handleFilterChange}
        />

        <Select
          prefix={t('jobs.sortPrefix')}
          style={{ width: 200 }}
          value={sortField}
          onChange={(val) => setValue('sort', val)}
        >
          <Select.Option value="name">{t('jobs.sortByName')}</Select.Option>
          <Select.Option value="numberOfFoundListings">{t('jobs.sortByListings')}</Select.Option>
          <Select.Option value="enabled">{t('jobs.sortByStatus')}</Select.Option>
        </Select>

        <Button
          icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
          onClick={() => setValue('dir', sortDir === 'asc' ? 'desc' : 'asc')}
          title={sortDir === 'asc' ? t('jobs.sortAscending') : t('jobs.sortDescending')}
        />

        <FilterButton activeCount={activeFilterCount} onClick={() => setFiltersOpen(true)} />

        <div className="jobGrid__topbar__view-toggle">
          <Tooltip content={t('jobs.tooltipGridView')}>
            <Button
              icon={<IconGridView />}
              theme={viewMode === 'grid' ? 'solid' : 'borderless'}
              onClick={() => switchViewMode('grid')}
              aria-label={t('common.ariaGridView')}
              aria-pressed={viewMode === 'grid'}
            />
          </Tooltip>
          <Tooltip content={t('jobs.tooltipTableView')}>
            <Button
              icon={<IconList />}
              theme={viewMode === 'table' ? 'solid' : 'borderless'}
              onClick={() => switchViewMode('table')}
              aria-label={t('common.ariaTableView')}
              aria-pressed={viewMode === 'table'}
            />
          </Tooltip>
        </div>
      </div>

      <ActiveFilterChips
        chips={describeActiveFilters(filterValues, { t })}
        onRemove={(key) => setValues(clearFilter(key))}
        onClearAll={() => setValues(clearAllFilters())}
      />

      <FilterDrawer
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        activeCount={activeFilterCount}
        onClearAll={() => setValues(clearAllFilters())}
      >
        <FilterGroup title={t('listings.filterGroupShow')}>
          <FilterHelp>{t('jobs.filterActivityHelp')}</FilterHelp>
          <RadioGroup
            type="button"
            buttonSize="middle"
            value={activityFilter === null ? 'all' : String(activityFilter)}
            onChange={(e) => {
              const value = e.target.value;
              setValues({ active: value === 'all' ? null : value === 'true', page: 1 });
            }}
          >
            <Radio value="all">{t('jobs.filterAll')}</Radio>
            <Radio value="true">{t('jobs.filterActive')}</Radio>
            <Radio value="false">{t('jobs.filterInactive')}</Radio>
          </RadioGroup>
        </FilterGroup>
      </FilterDrawer>

      {(jobsData?.result || []).length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description={t('jobs.empty')}
        />
      )}

      {viewMode === 'grid' ? (
        <div className="jobGrid__grid">
          {(jobsData?.result || []).map((job) => (
            <div key={job.id} className="jobGrid__card">
              <div className="jobGrid__card__header">
                <span className={`jobGrid__card__dot${job.enabled ? ' jobGrid__card__dot--active' : ''}`} />
                <span className="jobGrid__card__name" title={job.name}>
                  {job.name}
                </span>
                {job.running && <span className="jobGrid__card__running">{t('jobs.cardRunning')}</span>}
                {job.isOnlyShared && (
                  <Tooltip content={t('jobs.cardSharedReadOnly')}>
                    <IconAlertTriangle style={{ color: 'rgba(var(--semi-yellow-7), 1)' }} />
                  </Tooltip>
                )}
              </div>

              {/* "When did this last run, and did it find anything" is the reason to open this
                    page at all, and until now the answer was on no card. */}
              <div className="jobGrid__card__lastRun">
                {job.lastRunAt
                  ? t('jobs.cardLastRun', { time: relativeTime(job.lastRunAt, t) })
                  : t('jobs.lastRunNever')}
              </div>

              <div className="jobGrid__card__stats">
                <div className="jobGrid__card__stat">
                  <div className="jobGrid__card__statNumber">{job.numberOfFoundListings || 0}</div>
                  <div className="jobGrid__card__statLabel" title={t('jobs.cardListings')}>
                    {t('jobs.cardListings')}
                  </div>
                </div>
                <div className="jobGrid__card__stat">
                  <div className="jobGrid__card__statNumber">{job.provider?.length || 0}</div>
                  <div className="jobGrid__card__statLabel" title={t('jobs.cardProviders')}>
                    {t('jobs.cardProviders')}
                  </div>
                </div>
                <div className="jobGrid__card__stat">
                  <div className="jobGrid__card__statNumber">{job.notificationAdapter?.length || 0}</div>
                  <div className="jobGrid__card__statLabel" title={t('jobs.cardChannels')}>
                    {t('jobs.cardChannels')}
                  </div>
                </div>
              </div>

              <div className="jobGrid__card__divider" />

              {/* The dot in the header is the readout, this is the control. The word "Active"
                    that used to sit beside it was a third way of saying the same thing, so the
                    switch carries its name in an aria-label instead of in print. */}
              <div className="jobGrid__card__footer">
                <Switch
                  onChange={(checked) => onJobStatusChanged(job.id, checked)}
                  checked={job.enabled}
                  disabled={job.isOnlyShared}
                  size="small"
                  aria-label={t('jobs.toggleEnabled')}
                />
                <JobActions
                  job={job}
                  density="card"
                  onRun={onJobRun}
                  onEdit={(id) => navigate(`/jobs/edit/${id}`)}
                  onClone={(id) => navigate('/jobs/new', { state: { cloneFrom: id } })}
                  onDeleteListings={onListingRemoval}
                  onDeleteJob={onJobRemoval}
                />
              </div>
            </div>
          ))}
        </div>
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
