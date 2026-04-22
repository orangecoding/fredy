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
} from '../../../hooks/useSearchParamState.js';
import { Button, Pagination, Toast, Input, Select, Empty, Radio, RadioGroup, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconBriefcase,
  IconCart,
  IconDelete,
  IconLink,
  IconMapPin,
  IconStar,
  IconStarStroked,
  IconSearch,
  IconEyeOpened,
  IconArrowUp,
  IconArrowDown,
} from '@douyinfe/semi-icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ListingDeletionModal from '../../ListingDeletionModal.jsx';
import no_image from '../../../assets/no_image.jpg';
import * as timeService from '../../../services/time/timeService.js';
import { xhrDelete, xhrPost } from '../../../services/xhr.js';
import { useActions, useSelector } from '../../../services/state/store.js';
import { debounce } from '../../../utils';

import './ListingsGrid.less';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

const ListingsGrid = () => {
  const listingsData = useSelector((state) => state.listingsData);
  const providers = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const actions = useActions();
  const navigate = useNavigate();
  const sp = useSearchParams();

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
      // cleanup debounced handler to avoid memory leaks
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

  const handlePageChange = (_page) => {
    setPage(_page);
  };

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

  return (
    <div className="listingsGrid">
      <div className="listingsGrid__topbar">
        <Input
          className="listingsGrid__topbar__search"
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
      </div>

      {(listingsData?.result || []).length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description="No listings available yet..."
        />
      )}
      <div className="listingsGrid__grid">
        {(listingsData?.result || []).map((item) => (
          <div
            key={item.id}
            className="listingsGrid__card"
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/listings/listing/${item.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate(`/listings/listing/${item.id}`);
            }}
          >
            <div className="listingsGrid__card__image-wrapper">
              <img
                src={item.image_url || no_image}
                alt={item.title}
                onError={(e) => {
                  e.target.src = no_image;
                }}
              />
              {!item.is_active && (
                <div className="listingsGrid__card__inactive-watermark">
                  <span>Inactive</span>
                </div>
              )}
              <button
                type="button"
                className="listingsGrid__card__star"
                onClick={(e) => handleWatch(e, item)}
                aria-label={item.isWatched === 1 ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                {item.isWatched === 1 ? <IconStar /> : <IconStarStroked />}
              </button>
            </div>

            <div className="listingsGrid__card__body">
              <div className="listingsGrid__card__title" title={item.title}>
                {item.title}
              </div>
              {item.price && (
                <div className="listingsGrid__card__price">
                  <IconCart size="small" />
                  {item.price}
                </div>
              )}
              {item.address && (
                <div className="listingsGrid__card__meta">
                  <IconMapPin />
                  {item.address}
                </div>
              )}
              <div className="listingsGrid__card__meta">
                <IconBriefcase />
                {item.provider}
              </div>
              <div className="listingsGrid__card__provider">{timeService.format(item.created_at, false)}</div>
            </div>

            <div className="listingsGrid__card__actions" onClick={(e) => e.stopPropagation()}>
              <Tooltip content="Original Listing">
                <Button
                  size="small"
                  icon={<IconLink />}
                  style={{ color: '#60a5fa' }}
                  theme="borderless"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(item.link, '_blank');
                  }}
                />
              </Tooltip>
              <Tooltip content="View in Fredy">
                <Button
                  size="small"
                  icon={<IconEyeOpened />}
                  style={{ color: '#34d399' }}
                  theme="borderless"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/listings/listing/${item.id}`);
                  }}
                />
              </Tooltip>
              <Tooltip content="Remove">
                <Button
                  size="small"
                  icon={<IconDelete />}
                  style={{ color: '#fb7185' }}
                  theme="borderless"
                  onClick={(e) => {
                    e.stopPropagation();
                    setListingToDelete(item.id);
                    setDeleteModalVisible(true);
                  }}
                />
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
      {(listingsData?.result || []).length > 0 && (
        <div className="listingsGrid__pagination">
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            total={listingsData?.totalNumber || 0}
            onPageChange={handlePageChange}
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

export default ListingsGrid;
