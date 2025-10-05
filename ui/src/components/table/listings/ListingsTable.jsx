import React, { useState, useEffect, useMemo } from 'react';
import { Table, Popover, Input, Descriptions, Tag, Image, Empty, Button, Toast, Divider } from '@douyinfe/semi-ui';
import { useActions, useSelector } from '../../../services/state/store.js';
import { IconClose, IconDelete, IconSearch, IconStar, IconStarStroked, IconTick } from '@douyinfe/semi-icons';
import * as timeService from '../../../services/time/timeService.js';
import debounce from 'lodash/debounce';
import no_image from '../../../assets/no_image.jpg';

import './ListingsTable.less';
import { format } from '../../../services/time/timeService.js';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { xhrDelete, xhrPost } from '../../../services/xhr.js';
import ListingsFilter from './ListingsFilter.jsx';

const columns = [
  {
    title: '#',
    width: 100,
    dataIndex: 'isWatched',
    sorter: true,
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
                  Toast.success(row.isWatched === 1 ? 'Listing removed from Watchlist' : 'Listing added to Watchlist');
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
    title: 'State',
    dataIndex: 'is_active',
    width: 84,
    sorter: true,
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

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description="No listings available."
  />
);

export default function ListingsTable() {
  const tableData = useSelector((state) => state.listingsTable);
  const actions = useActions();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [sortData, setSortData] = useState({});
  const [freeTextFilter, setFreeTextFilter] = useState(null);
  const [watchListFilter, setWatchListFilter] = useState(null);
  const [jobNameFilter, setJobNameFilter] = useState(null);
  const [activityFilter, setActivityFilter] = useState(null);
  const [providerFilter, setProviderFilter] = useState(null);

  const handlePageChange = (_page) => {
    setPage(_page);
  };

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

  const expandRowRender = (record) => {
    return (
      <div className="listingsTable__expanded">
        <div>
          {record.image_url == null ? (
            <Image height={200} src={no_image} />
          ) : (
            <Image height={200} src={record.image_url} />
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
              <a href={record.link} target="_blank" rel="noreferrer">
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
      <ListingsFilter
        onActivityFilter={setActivityFilter}
        onWatchListFilter={setWatchListFilter}
        onJobNameFilter={setJobNameFilter}
        onProviderFilter={setProviderFilter}
      />
      <Input
        prefix={<IconSearch />}
        showClear
        className="listingsTable__search"
        placeholder="Search"
        onChange={handleFilterChange}
      />
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
          if (changeSet?.extra?.changeType === 'sorter') {
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
