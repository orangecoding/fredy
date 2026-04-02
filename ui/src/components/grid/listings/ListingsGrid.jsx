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
import {
  Card,
  Col,
  Row,
  Image,
  Button,
  Typography,
  Pagination,
  Toast,
  Divider,
  Input,
  Select,
  Empty,
  Radio,
  RadioGroup,
} from '@douyinfe/semi-ui-19';
import {
  IconBriefcase,
  IconCart,
  IconClock,
  IconDelete,
  IconLink,
  IconMapPin,
  IconStar,
  IconStarStroked,
  IconSearch,
  IconActivity,
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

const { Text } = Typography;

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

  const handleFilterChange = useMemo(() => debounce((value) => setFreeTextFilter(value || null), 500), []);

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

  const cap = (val) => {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
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
          }}
        >
          <Radio value="all">All</Radio>
          <Radio value="true">Watched</Radio>
          <Radio value="false">Unwatched</Radio>
        </RadioGroup>

        <Select
          placeholder="Provider"
          showClear
          onChange={(val) => setProviderFilter(val)}
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
          onChange={(val) => setJobNameFilter(val)}
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
      <Row gutter={[16, 16]}>
        {(listingsData?.result || []).map((item) => (
          <Col key={item.id} xs={24} sm={12} md={12} lg={8} xl={8} xxl={6}>
            <Card
              className={`listingsGrid__card ${!item.is_active ? 'listingsGrid__card--inactive' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/listings/listing/${item.id}`)}
              cover={
                <div style={{ position: 'relative' }}>
                  <div className="listingsGrid__imageContainer">
                    <Image
                      src={item.image_url || no_image}
                      fallback={no_image}
                      width="100%"
                      height={180}
                      style={{ objectFit: 'cover' }}
                      preview={false}
                    />
                    <Button
                      icon={
                        item.isWatched === 1 ? (
                          <IconStar style={{ color: 'rgba(var(--semi-green-5), 1)' }} />
                        ) : (
                          <IconStarStroked />
                        )
                      }
                      theme="light"
                      shape="circle"
                      size="small"
                      className="listingsGrid__watchButton"
                      onClick={(e) => handleWatch(e, item)}
                    />
                  </div>
                  {!item.is_active && <div className="listingsGrid__inactiveOverlay">Inactive</div>}
                </div>
              }
              bodyStyle={{ padding: '12px' }}
            >
              <div className="listingsGrid__content">
                <Text strong ellipsis={{ showTooltip: true }} className="listingsGrid__title">
                  {cap(item.title)}
                </Text>
                <div className="listingsGrid__price">
                  <IconCart size="small" />
                  {item.price} €
                </div>
                <div className="listingsGrid__meta">
                  <Text
                    type="secondary"
                    icon={<IconMapPin />}
                    size="small"
                    ellipsis={{ showTooltip: true }}
                    style={{ width: '100%' }}
                  >
                    {item.address || 'No address provided'}
                  </Text>
                  <Text type="tertiary" size="small" icon={<IconClock />}>
                    {timeService.format(item.created_at, false)}
                  </Text>
                  <Text type="tertiary" size="small" icon={<IconBriefcase />}>
                    {item.provider.charAt(0).toUpperCase() + item.provider.slice(1)}
                  </Text>
                  {item.distance_to_destination ? (
                    <Text type="tertiary" size="small" icon={<IconActivity />}>
                      {item.distance_to_destination} m to chosen address
                    </Text>
                  ) : (
                    <Text type="tertiary" size="small" icon={<IconActivity />}>
                      Distance cannot be calculated
                    </Text>
                  )}
                </div>
                <Divider margin=".6rem" />
                <div className="listingsGrid__actions">
                  <div className="listingsGrid__linkButton" onClick={(e) => e.stopPropagation()}>
                    <a href={item.link} target="_blank" rel="noopener noreferrer">
                      <IconLink />
                    </a>
                  </div>
                  <Button
                    type="secondary"
                    size="small"
                    title="View Details"
                    onClick={() => navigate(`/listings/listing/${item.id}`)}
                    icon={<IconEyeOpened />}
                  />
                  <Button
                    title="Remove"
                    type="danger"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setListingToDelete(item.id);
                      setDeleteModalVisible(true);
                    }}
                    icon={<IconDelete />}
                  />
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
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
