import React from 'react';

import { Button, Empty, Table, Switch, Popover } from '@douyinfe/semi-ui';
import { IconDelete, IconDescend2, IconEdit, IconHistogram } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';

import './JobTable.less';

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description="No jobs available. Why don't you create one? ;)"
  />
);

const getPopoverContent = (text) => <article className="jobPopoverContent">{text}</article>;

export default function JobTable({
  jobs = {},
  onJobRemoval,
  onJobStatusChanged,
  onJobEdit,
  onJobInsight,
  onListingRemoval,
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
          title: 'Listings',
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
                <Popover content={getPopoverContent('Job Insights')}>
                  <Button type="primary" icon={<IconHistogram />} onClick={() => onJobInsight(job.id)} />
                </Popover>
                <Popover content={getPopoverContent('Edit a Job')}>
                  <Button type="secondary" icon={<IconEdit />} onClick={() => onJobEdit(job.id)} />
                </Popover>
                <Popover content={getPopoverContent('Delete all found Listings of this Job')}>
                  <Button type="danger" icon={<IconDescend2 />} onClick={() => onListingRemoval(job.id)} />
                </Popover>
                <Popover content={getPopoverContent('Delete Job')}>
                  <Button type="danger" icon={<IconDelete />} onClick={() => onJobRemoval(job.id)} />
                </Popover>
              </div>
            );
          },
        },
      ]}
      dataSource={jobs}
    />
  );
}
