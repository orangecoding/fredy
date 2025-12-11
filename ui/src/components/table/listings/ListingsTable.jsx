/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Popover,
  Input,
  Descriptions,
  Tag,
  Image,
  Empty,
  Button,
  Toast,
  Divider,
  Space,
  Select,
} from '@douyinfe/semi-ui';
import { useActions, useSelector } from '../../../services/state/store.js';
import { IconClose, IconDelete, IconSearch, IconStar, IconStarStroked, IconTick } from '@douyinfe/semi-icons';
import * as timeService from '../../../services/time/timeService.js';
import debounce from 'lodash/debounce';
import no_image from '../../../assets/no_image.jpg';

import './ListingsTable.less';
import { format } from '../../../services/time/timeService.js';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { xhrDelete, xhrPost } from '../../../services/xhr.js';
import { useNavigate } from 'react-router-dom';
import { useFeature } from '../../../hooks/featureHook.js';

const getColumns = (provider, setProviderFilter, jobs, setJobNameFilter) => {
  return [
    {
      title: 'Watchlist',
      width: 133,
      dataIndex: 'isWatched',
      sorter: true,
      filters: [
        {
          text: 'Show only watched listings',
          value: 'watchList',
        },
      ],
      render: (id, row) => {
        return (
          <div>
            <Popover
              style={{
                padding: '.4rem',
                color: 'var(--semi-color-white)',
              }}
              content={row.isWatched === 1 ? 'Unwatch Listing' : 'Watch Listing'}
            >
              <Button
                icon={
                  row.isWatched === 1 ? (
                    <IconStar style={{ color: 'rgba(var(--semi-green-5), 1)' }} />
                  ) : (
                    <IconStarStroked />
                  )
                }
                theme="borderless"
                size="small"
                onClick={async () => {
                  try {
                    await xhrPost('/api/listings/watch', { listingId: row.id });
                    Toast.success(
                      row.isWatched === 1 ? 'Listing removed from Watchlist' : 'Listing added to Watchlist',
                    );
                    row.reloadTable();
                  } catch (e) {
                    console.error(e);
                    Toast.error('Failed to operate Watchlist');
                  }
                }}
              />
            </Popover>
            <Divider layout="vertical" margin="4px" />
            <Popover
              style={{
                padding: '.4rem',
                color: 'var(--semi-color-white)',
              }}
              content="Delete Listing"
            >
              <Button
                icon={<IconDelete />}
                theme="borderless"
                size="small"
                type="danger"
                onClick={async () => {
                  try {
                    await xhrDelete('/api/listings/', { ids: [row.id] });
                    Toast.success('Listing(s) successfully removed');
                    row.reloadTable();
                  } catch (error) {
                    Toast.error(error);
                  }
                }}
              />
            </Popover>
          </div>
        );
      },
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      width: 110,
      sorter: true,
      filters: [
        {
          text: 'Show only active listings',
          value: 'activityStatus',
        },
      ],
      render: (value) => {
        return value ? (
          <div style={{ color: 'rgba(var(--semi-green-6), 1)' }}>
            <Popover
              style={{
                padding: '.4rem',
                color: 'var(--semi-color-white)',
              }}
              content="Listing is still active"
            >
              <IconTick />
            </Popover>
          </div>
        ) : (
          <div style={{ color: 'rgba(var(--semi-red-5), 1)' }}>
            <Popover
              style={{
                padding: '.4rem',
                color: 'var(--semi-color-white)',
              }}
              content="Listing is inactive"
            >
              <IconClose />
            </Popover>
          </div>
        );
      },
    },
    {
      title: 'Job-Name',
      sorter: true,
      ellipsis: true,
      dataIndex: 'job_name',
      width: 150,
      onFilter: () => true,
      renderFilterDropdown: () => {
        return (
          <Space vertical style={{ padding: 8 }}>
            <Select showClear placeholder="Select Job to Filter" onChange={(val) => setJobNameFilter(val)}>
              {jobs != null &&
                jobs.length > 0 &&
                jobs.map((job) => {
                  return (
                    <Select.Option value={job.id} key={job.id}>
                      {job.name}
                    </Select.Option>
                  );
                })}
            </Select>
          </Space>
        );
      },
    },
    {
      title: 'Listing date',
      width: 130,
      dataIndex: 'created_at',
      sorter: true,
      render: (text) => timeService.format(text, false),
    },
    {
      title: 'Provider',
      width: 130,
      dataIndex: 'provider',
      sorter: true,
      render: (text) => text.charAt(0).toUpperCase() + text.slice(1),
      onFilter: () => true,
      renderFilterDropdown: () => {
        return (
          <Space vertical style={{ padding: 8 }}>
            <Select showClear placeholder="Select Provider to Filter" onChange={(val) => setProviderFilter(val)}>
              {provider != null &&
                provider.length > 0 &&
                provider.map((prov) => {
                  return (
                    <Select.Option value={prov.id} key={prov.id}>
                      {prov.name}
                    </Select.Option>
                  );
                })}
            </Select>
          </Space>
        );
      },
    },
    {
      title: 'Price',
      width: 110,
      dataIndex: 'price',
      sorter: true,
      render: (text) => text + ' €',
    },
    {
      title: 'Address',
      width: 150,
      dataIndex: 'address',
      sorter: true,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      sorter: true,
      ellipsis: true,
      render: (text, row) => {
        return (
          <a href={row.url} target="_blank" rel="noopener noreferrer">
            {text}
          </a>
        );
      },
    },
  ];
};

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description="No listings found."
  />
);

export default function ListingsTable() {
  const tableData = useSelector((state) => state.listingsTable);
  const provider = useSelector((state) => state.provider);
  const jobs = useSelector((state) => state.jobs.jobs);
  const navigate = useNavigate();

  const watchlistFeature = useFeature('WATCHLIST_MANAGEMENT') || false;
  const actions = useActions();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [sortData, setSortData] = useState({});
  const [freeTextFilter, setFreeTextFilter] = useState(null);
  const [watchListFilter, setWatchListFilter] = useState(null);
  const [jobNameFilter, setJobNameFilter] = useState(null);
  const [activityFilter, setActivityFilter] = useState(null);
  const [providerFilter, setProviderFilter] = useState(null);
  const [allFilters, setAllFilters] = useState([]);

  const [imageWidth, setImageWidth] = useState('100%');
  const handlePageChange = (_page) => {
    setPage(_page);
  };

  const columns = getColumns(provider, setProviderFilter, jobs, setJobNameFilter);
  const loadTable = () => {
    let sortfield = null;
    let sortdir = null;

    if (sortData != null && Object.keys(sortData).length > 0) {
      sortfield = sortData.field;
      sortdir = sortData.direction;
    }
    actions.listingsTable.getListingsTable({
      page,
      pageSize,
      sortfield,
      sortdir,
      freeTextFilter,
      filter: { watchListFilter, jobNameFilter, activityFilter, providerFilter },
    });
  };

  useEffect(() => {
    loadTable();
  }, [page, sortData, freeTextFilter, providerFilter, activityFilter, jobNameFilter, watchListFilter]);

  const handleFilterChange = useMemo(() => debounce((value) => setFreeTextFilter(value), 500), []);

  const diffArrays = (primary, secondary) => {
    const result = {};

    for (const item of secondary) {
      if (!primary.includes(item)) result[item] = true;
    }

    for (const item of primary) {
      if (!secondary.includes(item)) result[item] = false;
    }

    return [result];
  };

  useEffect(() => {
    return () => {
      // cleanup debounced handler to avoid memory leaks
      handleFilterChange.cancel && handleFilterChange.cancel();
    };
  }, [handleFilterChange]);

  const expandRowRender = (record) => {
    return (
      <div className="listingsTable__expanded">
        <div>
          {record.image_url == null ? (
            <Image height={200} width={180} src={no_image} />
          ) : (
            <Image
              height={200}
              width={imageWidth}
              src={record.image_url}
              onError={() => {
                setImageWidth('180px');
              }}
              fallback={<Image height={200} src={no_image} />}
            />
          )}
        </div>
        <div>
          <Descriptions align="justify">
            <Descriptions.Item itemKey="Listing still online">
              <Tag size="small" shape="circle" color={record.is_active ? 'green' : 'red'}>
                {record.is_active ? 'Yes' : 'No'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item itemKey="Link">
              <a href={record.link} target="_blank" rel="noopener noreferrer">
                Link to Listing
              </a>
            </Descriptions.Item>
            <Descriptions.Item itemKey="Listing date">{format(record.created_at)}</Descriptions.Item>
            <Descriptions.Item itemKey="Price">{record.price} €</Descriptions.Item>
          </Descriptions>
          <b>{record.title}</b>
          <p>{record.description == null ? 'No description available' : record.description}</p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <Input
        prefix={<IconSearch />}
        showClear
        className="listingsTable__search"
        placeholder="Search"
        onChange={handleFilterChange}
      />
      {watchlistFeature && (
        <Button
          className="listingsTable__setupButton"
          onClick={() => {
            navigate('/watchlistManagement');
          }}
        >
          Setup notifications on watchlist changes
        </Button>
      )}
      <Table
        rowKey="id"
        empty={empty}
        hideExpandedColumn={false}
        sticky={{ top: 5 }}
        columns={columns}
        expandedRowRender={expandRowRender}
        dataSource={(tableData?.result || []).map((row) => {
          return {
            ...row,
            reloadTable: loadTable,
          };
        })}
        onChange={(changeSet) => {
          if (changeSet?.extra?.changeType === 'filter') {
            const transformed = changeSet.filters.map((f) => f.dataIndex);
            const diff = diffArrays(allFilters, transformed);
            setAllFilters(transformed);
            diff.forEach((filter) => {
              switch (Object.keys(filter)[0]) {
                case 'isWatched':
                  setWatchListFilter(Object.values(filter)[0]);
                  break;
                case 'is_active':
                  setActivityFilter(Object.values(filter)[0]);
                  break;
                default:
                  console.error('Unknown filter: ', filter.dataIndex);
              }
            });
          } else if (changeSet?.extra?.changeType === 'sorter') {
            setSortData({
              field: changeSet.sorter.dataIndex,
              direction: changeSet.sorter.sortOrder === 'ascend' ? 'asc' : 'desc',
            });
          }
        }}
        pagination={{
          currentPage: page,
          //for now fixed
          pageSize,
          total: tableData?.totalNumber || 0,
          onPageChange: handlePageChange,
        }}
      />
    </div>
  );
}
