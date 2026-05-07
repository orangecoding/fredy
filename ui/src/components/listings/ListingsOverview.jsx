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
import { Button, Pagination, Toast, Input, Select, Empty, Radio, RadioGroup, Tooltip } from '@douyinfe/semi-ui-19';
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

const ListingsOverview = () => {
  const listingsData = useSelector((state) => state.listingsData);
  const providers = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();

  const viewMode = userSettings?.listings_view_mode ?? 'grid';

  const [page, setPage] = useSearchParamState(sp, 'page', 1, parseNumber);
  const pageSize = 40;

  const [sortField, setSortField] = useSearchParamState(sp, 'sort', 'created_at', parseString);
  const [sortDir, setSortDir] = useSearchParamState(sp, 'dir', 'desc', parseString);
  const [freeTextFilter, setFreeTextFilter] = useSearchParamState(sp, 'q', null, parseString);
  const [watchListFilter, setWatchListFilter] = useSearchParamState(sp, 'watch', null, parseNullableBoolean);
  const [jobNameFilter, setJobNameFilter] = useSearchParamState(sp, 'job', null, parseString);
  const [activityFilter, setActivityFilter] = useSearchParamState(sp, 'active', null, parseNullableBoolean);
  const [providerFilter, setProviderFilter] = useSearchParamState(sp, 'provider', null, parseString);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [listingToDelete, setListingToDelete] = useState(null);

  const loadData = () => {
    actions.listingsData.getListingsData({
      page,
      pageSize,
      sortfield: sortField,
      sortdir: sortDir,
      freeTextFilter,
      filter: { watchListFilter, jobNameFilter, activityFilter, providerFilter },
    });
  };

  useEffect(() => {
    loadData();
  }, [page, sortField, sortDir, freeTextFilter, providerFilter, activityFilter, jobNameFilter, watchListFilter]);

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
      Toast.success(item.isWatched === 1 ? 'Listing removed from Watchlist' : 'Listing added to Watchlist');
      loadData();
    } catch (e) {
      console.error(e);
      Toast.error('Failed to operate Watchlist');
    }
  };

  const handleDelete = (id) => {
    setListingToDelete(id);
    setDeleteModalVisible(true);
  };

  const handleNavigate = (id) => navigate(`/listings/listing/${id}`);

  const confirmDeletion = async (hardDelete) => {
    try {
      await xhrDelete('/api/listings/', { ids: [listingToDelete], hardDelete });
      Toast.success('Listing successfully removed');
      loadData();
    } catch (error) {
      Toast.error(error.message || 'Error deleting listing');
    } finally {
      setDeleteModalVisible(false);
      setListingToDelete(null);
    }
  };

  const listings = listingsData?.result || [];

  return (
    <div className="listingsOverview">
      <div className="listingsOverview__topbar">
        <Input
          className="listingsOverview__topbar__search"
          prefix={<IconSearch />}
          showClear
          placeholder="Search"
          defaultValue={freeTextFilter ?? ''}
          onChange={handleFilterChange}
        />

        <RadioGroup
          type="button"
          buttonSize="middle"
          value={activityFilter === null ? 'all' : String(activityFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setActivityFilter(v === 'all' ? null : v === 'true');
            setPage(1);
          }}
        >
          <Radio value="all">All</Radio>
          <Radio value="true">Active</Radio>
          <Radio value="false">Inactive</Radio>
        </RadioGroup>

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
          <Radio value="all">All</Radio>
          <Radio value="true">Watched</Radio>
          <Radio value="false">Unwatched</Radio>
        </RadioGroup>

        <Select
          placeholder="Provider"
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

        <Select
          placeholder="Job"
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

        <Select prefix="Sort by" style={{ width: 185 }} value={sortField} onChange={(val) => setSortField(val)}>
          <Select.Option value="job_name">Job Name</Select.Option>
          <Select.Option value="created_at">Listing Date</Select.Option>
          <Select.Option value="price">Price</Select.Option>
          <Select.Option value="provider">Provider</Select.Option>
        </Select>

        <Button
          icon={sortDir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        />

        <div className="listingsOverview__topbar__view-toggle">
          <Tooltip content="Grid view">
            <Button
              icon={<IconGridView />}
              theme={viewMode === 'grid' ? 'solid' : 'borderless'}
              onClick={() => actions.userSettings.setListingsViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            />
          </Tooltip>
          <Tooltip content="Table view">
            <Button
              icon={<IconList />}
              theme={viewMode === 'table' ? 'solid' : 'borderless'}
              onClick={() => actions.userSettings.setListingsViewMode('table')}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
            />
          </Tooltip>
        </div>
      </div>

      {listings.length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description="No listings available yet..."
        />
      )}

      {viewMode === 'grid' ? (
        <ListingsGrid listings={listings} onWatch={handleWatch} onNavigate={handleNavigate} onDelete={handleDelete} />
      ) : (
        <ListingsTable listings={listings} onWatch={handleWatch} onNavigate={handleNavigate} onDelete={handleDelete} />
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
