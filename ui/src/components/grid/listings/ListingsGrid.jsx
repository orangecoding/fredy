/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Col,
  Row,
  Image,
  Button,
  Space,
  Typography,
  Pagination,
  Toast,
  Divider,
  Input,
  Select,
  Popover,
  Empty,
} from '@douyinfe/semi-ui';
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
  IconFilter,
} from '@douyinfe/semi-icons';
import no_image from '../../../assets/no_image.jpg';
import * as timeService from '../../../services/time/timeService.js';
import { xhrDelete, xhrPost } from '../../../services/xhr.js';
import { useActions, useSelector } from '../../../services/state/store.js';
import debounce from 'lodash/debounce';

import './ListingsGrid.less';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

const { Text } = Typography;

const ListingsGrid = () => {
  const listingsData = useSelector((state) => state.listingsData);
  const providers = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const actions = useActions();

  const [page, setPage] = useState(1);
  const pageSize = 40;

  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [freeTextFilter, setFreeTextFilter] = useState(null);
  const [watchListFilter, setWatchListFilter] = useState(null);
  const [jobNameFilter, setJobNameFilter] = useState(null);
  const [activityFilter, setActivityFilter] = useState(null);
  const [providerFilter, setProviderFilter] = useState(null);
  const [showFilterBar, setShowFilterBar] = useState(false);

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

  const handleFilterChange = useMemo(() => debounce((value) => setFreeTextFilter(value), 500), []);

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

  return (
    <div className="listingsGrid">
      <div className="listingsGrid__searchbar">
        <Input prefix={<IconSearch />} showClear placeholder="Search" onChange={handleFilterChange} />
        <Popover content="Filter / Sort Results" style={{ color: 'white', padding: '.5rem' }}>
          <Button
            icon={<IconFilter />}
            onClick={() => {
              setShowFilterBar(!showFilterBar);
            }}
          />
        </Popover>
      </div>
      {showFilterBar && (
        <div className="listingsGrid__toolbar">
          <Space wrap style={{ marginBottom: '1rem' }}>
            <div className="listingsGrid__toolbar__card">
              <div>
                <Text strong>Filter by:</Text>
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <Select
                  placeholder="Status"
                  showClear
                  onChange={(val) => setActivityFilter(val)}
                  value={activityFilter}
                >
                  <Select.Option value={true}>Active</Select.Option>
                  <Select.Option value={false}>Not Active</Select.Option>
                </Select>

                <Select
                  placeholder="Watchlist"
                  showClear
                  onChange={(val) => setWatchListFilter(val)}
                  value={watchListFilter}
                >
                  <Select.Option value={true}>Watched</Select.Option>
                  <Select.Option value={false}>Not Watched</Select.Option>
                </Select>

                <Select
                  placeholder="Provider"
                  showClear
                  onChange={(val) => setProviderFilter(val)}
                  value={providerFilter}
                >
                  {providers?.map((p) => (
                    <Select.Option key={p.id} value={p.id}>
                      {p.name}
                    </Select.Option>
                  ))}
                </Select>

                <Select
                  placeholder="Job Name"
                  showClear
                  onChange={(val) => setJobNameFilter(val)}
                  value={jobNameFilter}
                >
                  {jobs?.map((j) => (
                    <Select.Option key={j.id} value={j.id}>
                      {j.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </div>
            <Divider layout="vertical" />

            <div className="listingsGrid__toolbar__card">
              <div>
                <Text strong>Sort by:</Text>
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <Select
                  placeholder="Sort By"
                  style={{ width: 140 }}
                  value={sortField}
                  onChange={(val) => setSortField(val)}
                >
                  <Select.Option value="job_name">Job Name</Select.Option>
                  <Select.Option value="created_at">Listing Date</Select.Option>
                  <Select.Option value="price">Price</Select.Option>
                  <Select.Option value="provider">Provider</Select.Option>
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

      {(listingsData?.result || []).length === 0 && (
        <Empty
          image={<IllustrationNoResult />}
          darkModeImage={<IllustrationNoResultDark />}
          description="No listings available yet..."
        />
      )}
      <Row gutter={[16, 16]}>
        {(listingsData?.result || []).map((item) => (
          <Col key={item.id} xs={24} sm={12} md={8} lg={6} xl={4} xxl={6}>
            <Card
              className={`listingsGrid__card ${!item.is_active ? 'listingsGrid__card--inactive' : ''}`}
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
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="listingsGrid__titleLink">
                  <Text strong ellipsis={{ showTooltip: true }} className="listingsGrid__title">
                    {item.title}
                  </Text>
                </a>
                <Space vertical align="start" spacing={2} style={{ width: '100%', marginTop: 8 }}>
                  <Text type="secondary" icon={<IconCart />} size="small">
                    {item.price != null ? `CHF ${item.price.toLocaleString('de-CH')}` : '-'}
                  </Text>
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
                </Space>
                <Divider margin=".6rem" />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Button
                    title="Link to listing"
                    type="primary"
                    size="small"
                    onClick={async () => {
                      window.open(item.link);
                    }}
                    icon={<IconLink />}
                  />

                  <Button
                    title="Remove"
                    type="danger"
                    size="small"
                    onClick={async () => {
                      try {
                        await xhrDelete('/api/listings/', { ids: [item.id] });
                        Toast.success('Listing(s) successfully removed');
                        loadData();
                      } catch (error) {
                        Toast.error(error);
                      }
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
    </div>
  );
};

export default ListingsGrid;
