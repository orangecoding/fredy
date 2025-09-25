import React, { useState, useEffect } from 'react';
import { Table, Popover } from '@douyinfe/semi-ui';
import { useActions, useSelector } from '../../services/state/store.js';
import { IconClose, IconTick } from '@douyinfe/semi-icons';

const columns = [
  {
    title: '',
    dataIndex: 'is_active',
    width: 30,
    sorter: (a, b) => (a.updateTime - b.updateTime > 0 ? 1 : -1),
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
    dataIndex: 'job_name',
    width: 120,
    filters: [
      {
        text: 'Semi Design design draft',
        value: 'Semi Design design draft',
      },
      {
        text: 'Semi D2C design draft',
        value: 'Semi D2C design draft',
      },
    ],
    onFilter: (value, record) => record.name.includes(value),
  },
  {
    title: 'Provider',
    dataIndex: 'provider',
    sorter: (a, b) => (a.size - b.size > 0 ? 1 : -1),
    render: (text) => text.charAt(0).toUpperCase() + text.slice(1),
  },
  {
    title: 'Title',
    dataIndex: 'title',
  },
];

export default function ListingsTable() {
  const tableData = useSelector((state) => state.listingsTable);
  const actions = useActions();
  const [page, setPage] = useState(1);

  const handlePageChange = (_page) => {
    setPage(_page);
  };

  useEffect(() => {
    actions.listingsTable.getListingsTable({ page });
  }, [page]);

  return (
    <Table
      sticky={{ top: 5 }}
      columns={columns}
      dataSource={tableData?.result || []}
      pagination={{
        currentPage: page,
        //for now fixed
        pageSize: 20,
        total: tableData?.totalNumber || 0,
        onPageChange: handlePageChange,
      }}
      loading={false}
    />
  );
}
