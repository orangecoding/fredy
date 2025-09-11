import React from 'react';

import { Button, Empty, Table, Switch } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconHistogram, IconList } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

import './JobTable.less';

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description={'No jobs available.'}
  />
);

export default function JobTable({
  jobs = {},
  onJobRemoval,
  onJobStatusChanged,
  onJobEdit,
  onJobInsight,
  onViewListings,
} = {}) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: '',
          dataIndex: '',
          render: (job) => {
            return <Switch onChange={(checked) => onJobStatusChanged(job.id, checked)} checked={job.enabled} />;
          },
        },
        {
          title: 'Name',
          dataIndex: 'name',
        },
        {
          title: 'Findings',
          dataIndex: 'numberOfFoundListings',
          render: (value) => {
            return value || 0;
          },
        },
        {
          title: 'Providers',
          dataIndex: 'provider',
          render: (value) => {
            return value.length || 0;
          },
        },
        {
          title: 'Notification adapters',
          dataIndex: 'notificationAdapter',
          render: (value) => {
            return value.length || 0;
          },
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, job) => {
            return (
              <div className="interactions">
                <Button type="primary" icon={<IconHistogram />} onClick={() => onJobInsight(job.id)} />
                <Button type="secondary" icon={<IconList />} onClick={() => onViewListings(job.id)} />
                <Button type="secondary" icon={<IconEdit />} onClick={() => onJobEdit(job.id)} />
                <Button type="danger" icon={<IconDelete />} onClick={() => onJobRemoval(job.id)} />
              </div>
            );
          },
        },
      ]}
      dataSource={jobs}
    />
  );
}
