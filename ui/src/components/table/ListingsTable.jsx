import React, { useState, useEffect, useMemo } from 'react';
import { Table, Popover, Input, Descriptions, Tag, Image } from '@douyinfe/semi-ui';
import { useActions, useSelector } from '../../services/state/store.js';
import { IconClose, IconSearch, IconTick } from '@douyinfe/semi-icons';
import * as timeService from '../../services/time/timeService.js';
import debounce from 'lodash/debounce';
import no_image from '../../assets/no_image.jpg';

import './ListingsTable.less';
import { format } from '../../services/time/timeService.js';

const columns = [
  {
    title: '#',
    dataIndex: 'is_active',
    width: 58,
    sorter: true,
    render: (value) => {
      return value ? (
        <div style={{ color: 'rgba(var(--semi-green-6), 1)' }}>
          <Popover
            style={{
              padding: '.4rem',
              color: 'var(--semi-color-white)',
            }}
            content="Listing still online"
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
            content="Listing not online anymore"
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
    dataIndex: 'job_name',
    width: 170,
  },
  {
    title: 'Listing date',
    width: 130,
    dataIndex: 'created_at',
    sorter: true,
    render: (text) => timeService.format(text),
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
    width: 100,
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
    render: (text, row) => {
      return (
        <a href={row.url} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      );
    },
  },
];

export default function ListingsTable() {
  const tableData = useSelector((state) => state.listingsTable);
  const actions = useActions();
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [sortData, setSortData] = useState({});
  const [filter, setFilter] = useState(null);

  const handlePageChange = (_page) => {
    setPage(_page);
  };

  useEffect(() => {
    let sortfield = null;
    let sortdir = null;

    if (sortData != null && Object.keys(sortData).length > 0) {
      sortfield = sortData.field;
      sortdir = sortData.direction;
    }
    actions.listingsTable.getListingsTable({ page, pageSize, sortfield, sortdir, filter });
  }, [page, sortData, filter]);

  const handleFilterChange = useMemo(() => debounce((value) => setFilter(value), 500), []);

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
      <Input
        prefix={<IconSearch />}
        showClear
        className="listingsTable__search"
        placeholder="Search"
        onChange={handleFilterChange}
      />
      <Table
        rowKey="id"
        hideExpandedColumn={false}
        sticky={{ top: 5 }}
        columns={columns}
        expandedRowRender={expandRowRender}
        dataSource={tableData?.result || []}
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
