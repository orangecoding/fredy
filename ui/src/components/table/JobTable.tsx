import React from 'react';

import { Button, Empty, Table, Switch } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconHistogram } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description={'No jobs available'}
  />
);

export default function JobTable({ jobs = {}, onJobRemoval, onJobStatusChanged, onJobEdit, onJobInsight } = {}) {
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
          title: 'Job Name',
          dataIndex: 'name',
        },
        {
          title: 'Number of findings',
          dataIndex: 'numberOfFoundListings',
          render: (value) => {
            return value || 0;
          },
        },
        {
          title: 'Active provider',
          dataIndex: 'provider',
          render: (value) => {
            return value.length || 0;
          },
        },
        {
          title: 'Active notification adapter',
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
              <div style={{ float: 'right' }}>
                <Button
                  type="primary"
                  icon={<IconHistogram />}
                  onClick={() => onJobInsight(job.id)}
                  style={{ marginRight: '1rem' }}
                />
                <Button
                  type="secondary"
                  icon={<IconEdit />}
                  onClick={() => onJobEdit(job.id)}
                  style={{ marginRight: '1rem' }}
                />
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
