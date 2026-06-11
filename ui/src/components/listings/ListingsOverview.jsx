/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect, useMemo } from 'react';
import {
  useSearchParamState,
  parseNumber,
  parseString,
  parseNullableBoolean,
} from '../../hooks/useSearchParamState.js';
import {
  Button,
  Pagination,
  Toast,
  Input,
  Select,
  Empty,
  Radio,
  RadioGroup,
  Tooltip,
  Banner,
} from '@douyinfe/semi-ui-19';
import { IconSearch, IconArrowUp, IconArrowDown, IconGridView, IconList } from '@douyinfe/semi-icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ListingDeletionModal from '../ListingDeletionModal.jsx';
import { xhrDelete, xhrPost } from '../../services/xhr.js';
import { useActions, useSelector } from '../../services/state/store.js';
import { debounce } from '../../utils';
import ListingsGrid from '../grid/listings/ListingsGrid.jsx';
import ListingsTable from '../table/ListingsTable.jsx';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

import './ListingsOverview.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const ListingsOverview = ({ mode = 'all' }) => {
  const t = useTranslation();
  const isWatchlistMode = mode === 'watchlist';
  const listingsData = useSelector((state) => state.listingsData);
  const providers = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();

  const viewMode = userSettings?.listings_view_mode ?? 'grid';
  const listingDeletionPref = userSettings?.listing_deletion_preference;
  const defaultDeleteType = listingDeletionPref?.hardDelete ? 'hard' : 'soft';

  const [page, setPage] = useSearchParamState(sp, 'page', 1, parseNumber);
  const pageSize = 40;

  const [sortField, setSortField] = useSearchParamState(sp, 'sort', 'created_at', parseString);
  const [sortDir, setSortDir] = useSearchParamState(sp, 'dir', 'desc', parseString);
  const [freeTextFilter, setFreeTextFilter] = useSearchParamState(sp, 'q', null, parseString);
  const [watchListFilter, setWatchListFilter] = useSearchParamState(sp, 'watch', null, parseNullableBoolean);
  const [jobNameFilter, setJobNameFilter] = useSearchParamState(sp, 'job', null, parseString);
  const [activityFilter, setActivityFilter] = useSearchParamState(sp, 'active', null, parseNullableBoolean);
  const [providerFilter, setProviderFilter] = useSearchParamState(sp, 'provider', null, parseString);
  const [statusFilter, setStatusFilter] = useSearchParamState(sp, 'status', null, parseString);
  const [hiddenOnly, setHiddenOnly] = useSearchParamState(sp, 'hidden', false, parseNullableBoolean);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [listingToDelete, setListingToDelete] = useState(null);

  const isHiddenView = hiddenOnly === true;

  // In watchlist mode the watch filter is forced to "watched only" — regardless of the URL.
  const effectiveWatchListFilter = isWatchlistMode ? true : watchListFilter;

  const loadData = () => {
    actions.listingsData.getListingsData({
      page,
      pageSize,
      sortfield: sortField,
      sortdir: sortDir,
      freeTextFilter,
      filter: {
        watchListFilter: effectiveWatchListFilter,
        jobNameFilter,
        activityFilter: isHiddenView ? null : activityFilter,
        providerFilter,
        statusFilter,
        hiddenOnly: isHiddenView ? true : undefined,
      },
    });
  };

  useEffect(() => {
    loadData();
  }, [
    page,
    sortField,
    sortDir,
    freeTextFilter,
    providerFilter,
    activityFilter,
    jobNameFilter,
    watchListFilter,
    statusFilter,
    hiddenOnly,
    isWatchlistMode,
  ]);

  const handleFilterChange = useMemo(
    () =>
      debounce((value) => {
        setFreeTextFilter(value || null);
        setPage(1);
      }, 500),
    [],
  );

  useEffect(() => {
    return () => {
      handleFilterChange.cancel && handleFilterChange.cancel();
    };
  }, [handleFilterChange]);

  const handleWatch = async (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await xhrPost('/api/listings/watch', { listingId: item.id });
      Toast.success(
        item.isWatched === 1 ? t('listings.toastRemovedFromWatchlist') : t('listings.toastAddedToWatchlist'),
      );
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastWatchlistError'));
    }
  };

  const handleStatusChange = async (item, nextStatus) => {
    try {
      await actions.listingsData.setListingStatus(item.id, nextStatus);
      Toast.success(nextStatus ? `Marked as ${nextStatus}` : t('listings.toastStatusCleared'));
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastStatusUpdateError'));
    }
  };

  const handleDelete = (id) => {
    if (listingDeletionPref?.skipPrompt) {
      confirmDeletion(listingDeletionPref.hardDelete, false, id);
      return;
    }
    setListingToDelete(id);
    setDeleteModalVisible(true);
  };

  const handleRestore = async (id) => {
    try {
      await actions.listingsData.restoreListings([id]);
      Toast.success(t('listings.toastRestored'));
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error(t('listings.toastRestoreError'));
    }
  };

  const handleNavigate = (id) => {
    if (isHiddenView) return;
    navigate(`/listings/listing/${id}`);
  };

  const confirmDeletion = async (hardDelete, remember, id = listingToDelete) => {
    try {
      if (remember) {
        await actions.userSettings.setListingDeletionPreference({ skipPrompt: true, hardDelete });
      }
      await xhrDelete('/api/listings/', { ids: [id], hardDelete });
      Toast.success(t('listings.toastDeleted'));
      loadData();
    } catch (error) {
      Toast.error(error.message || t('listings.toastDeleteError'));
    } finally {
      setDeleteModalVisible(false);
      setListingToDelete(null);
    }
  };

  const listings = listingsData?.result || [];

  const activityRadioValue = isHiddenView ? 'hidden' : activityFilter === null ? 'all' : String(activityFilter);

  return (
    <div className="listingsOverview">
      <div className="listingsOverview__topbar">
        <Tooltip content={t('listings.filterSearchHelp')} trigger="hover" position="top">
          <span className="listingsOverview__topbar__tooltipWrap listingsOverview__topbar__search">
            <Input
              prefix={<IconSearch />}
              showClear
              placeholder={t('listings.searchPlaceholder')}
              defaultValue={freeTextFilter ?? ''}
              onChange={handleFilterChange}
            />
          </span>
        </Tooltip>

        <Tooltip content={t('listings.filterActivityHelp')} trigger="hover" position="top">
          <span className="listingsOverview__topbar__tooltipWrap">
            <RadioGroup
              type="button"
              buttonSize="middle"
              value={activityRadioValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'hidden') {
                  setHiddenOnly(true);
                  setActivityFilter(null);
                } else {
                  setHiddenOnly(false);
                  setActivityFilter(v === 'all' ? null : v === 'true');
                }
                setPage(1);
              }}
            >
              <Radio value="all">{t('listings.filterAll')}</Radio>
              <Radio value="true">{t('listings.filterActive')}</Radio>
              <Radio value="false">{t('listings.filterInactive')}</Radio>
              <Radio value="hidden">{t('listings.filterHidden')}</Radio>
            </RadioGroup>
          </span>
        </Tooltip>

        {!isWatchlistMode && (
          <Tooltip content={t('listings.filterWatchHelp')} trigger="hover" position="top">
            <span className="listingsOverview__topbar__tooltipWrap">
              <RadioGroup
                type="button"
                buttonSize="middle"
                value={watchListFilter === null ? 'all' : String(watchListFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setWatchListFilter(v === 'all' ? null : v === 'true');
                  setPage(1);
                }}
              >
                <Radio value="all">{t('listings.filterAll')}</Radio>
                <Radio value="true">{t('listings.filterWatched')}</Radio>
                <Radio value="false">{t('listings.filterUnwatched')}</Radio>
              </RadioGroup>
            </span>
          </Tooltip>
        )}

        <Tooltip content={t('listings.filterStatusHelp')} trigger="hover" position="top">
          <span className="listingsOverview__topbar__tooltipWrap">
            <Select
              placeholder={t('listings.filterStatusPlaceholder')}
              showClear
              onChange={(val) => {
                setStatusFilter(val ?? null);
                setPage(1);
              }}
              value={statusFilter}
              style={{ width: 150 }}
            >
              <Select.Option value="applied">{t('listings.filterStatusApplied')}</Select.Option>
              <Select.Option value="rejected">{t('listings.filterStatusRejected')}</Select.Option>
              <Select.Option value="accepted">{t('listings.filterStatusAccepted')}</Select.Option>
              <Select.Option value="none">{t('listings.filterStatusNone')}</Select.Option>
            </Select>
          </span>
        </Tooltip>

        <Tooltip content={t('listings.filterProviderHelp')} trigger="hover" position="top">
          <span className="listingsOverview__topbar__tooltipWrap">
            <Select
              placeholder={t('listings.filterProviderPlaceholder')}
              showClear
              onChange={(val) => {
                setProviderFilter(val);
                setPage(1);
              }}
              value={providerFilter}
              style={{ width: 130 }}
            >
              {providers?.map((p) => (
                <Select.Option key={p.id} value={p.id}>
                  {p.name}
                </Select.Option>
              ))}
            </Select>
          </span>
        </Tooltip>

        <Tooltip content={t('listings.filterJobHelp')} trigger="hover" position="top">
          <span className="listingsOverview__topbar__tooltipWrap">
            <Select
              placeholder={t('listings.filterJobPlaceholder')}
              showClear
              onChange={(val) => {
                setJobNameFilter(val);
                setPage(1);
              }}
              value={jobNameFilter}
              style={{ width: 130 }}
            >
              {jobs?.map((j) => (
                <Select.Option key={j.id} value={j.id}>
                  {j.name}
                </Select.Option>
              ))}
            </Select>
          </span>
        </Tooltip>

        <Tooltip content={t('listings.filterSortHelp')} trigger="hover" position="top">
          <span className="listingsOverview__topbar__tooltipWrap listingsOverview__topbar__sort">
            <Select
              prefix={t('listings.sortPrefix')}
              style={{ width: 220 }}
              value={sortField}
              onChange={(val) => setSortField(val)}
            >
              <Select.Option value="job_name">{t('listings.sortByJobName')}</Select.Option>
              <Select.Option value="created_at">{t('listings.sortByDate')}</Select.Option>
              <Select.Option value="price">{t('listings.sortByPrice')}</Select.Option>
              <Select.Option value="provider">{t('listings.sortByProvider')}</Select.Option>
            </Select>
          </span>
        </Tooltip>

        <Tooltip
          content={sortDir === 'asc' ? t('listings.sortAscending') : t('listings.sortDescending')}
          trigger="hover"
          position="top"
        >
          <span className="listingsOverview__topbar__tooltipWrap">
            <Button
              icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
              onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              aria-label={sortDir === 'asc' ? t('listings.sortAscending') : t('listings.sortDescending')}
            />
          </span>
        </Tooltip>

        <div className="listingsOverview__topbar__view-toggle">
          <Tooltip content={t('listings.tooltipGridView')}>
            <Button
              icon={<IconGridView />}
              theme={viewMode === 'grid' ? 'solid' : 'borderless'}
              onClick={() => actions.userSettings.setListingsViewMode('grid')}
              aria-label={t('common.ariaGridView')}
              aria-pressed={viewMode === 'grid'}
            />
          </Tooltip>
          <Tooltip content={t('listings.tooltipTableView')}>
            <Button
              icon={<IconList />}
              theme={viewMode === 'table' ? 'solid' : 'borderless'}
              onClick={() => actions.userSettings.setListingsViewMode('table')}
              aria-label={t('common.ariaTableView')}
              aria-pressed={viewMode === 'table'}
            />
          </Tooltip>
        </div>
      </div>

      {isHiddenView && (
        <Banner
          type="info"
          fullMode={false}
          closeIcon={null}
          description={t('listings.hiddenViewBanner')}
          style={{ marginBottom: 12 }}
        />
      )}

      {listings.length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description={t('listings.empty')}
        />
      )}

      {viewMode === 'grid' ? (
        <ListingsGrid
          listings={listings}
          onWatch={handleWatch}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRestore={handleRestore}
          isHiddenView={isHiddenView}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <ListingsTable
          listings={listings}
          onWatch={handleWatch}
          onNavigate={handleNavigate}
          onDelete={handleDelete}
          onRestore={handleRestore}
          isHiddenView={isHiddenView}
          onStatusChange={handleStatusChange}
        />
      )}

      {listings.length > 0 && (
        <div className="listingsOverview__pagination">
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={listingsData?.totalNumber || 0}
            onPageChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}

      <ListingDeletionModal
        visible={deleteModalVisible}
        defaultDeleteType={defaultDeleteType}
        onConfirm={confirmDeletion}
        onCancel={() => {
          setDeleteModalVisible(false);
          setListingToDelete(null);
        }}
      />
    </div>
  );
};

export default ListingsOverview;
