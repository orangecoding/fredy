/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { Button, Empty, Table, Switch, Popover } from '@douyinfe/semi-ui';
import { IconAlertTriangle, IconDelete, IconDescend2, IconEdit } from '@douyinfe/semi-icons';
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

export default function JobTable({ jobs = {}, onJobRemoval, onJobStatusChanged, onJobEdit, onListingRemoval } = {}) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: '',
          dataIndex: '',
          render: (job) => {
            return (
              <Switch
                onChange={(checked) => onJobStatusChanged(job.id, checked)}
                checked={job.enabled}
                disabled={job.isOnlyShared}
              />
            );
          },
        },
        {
          title: 'Name',
          dataIndex: 'name',
          render: (name, job) => {
            if (job.isOnlyShared) {
              return (
                <Popover
                  content={getPopoverContent(
                    'This job has been shared with you by another user, therefor it is read-only.',
                  )}
                >
                  <div style={{ display: 'flex', gap: '.3rem' }}>
                    <div style={{ color: 'rgba(var(--semi-yellow-7), 1)' }}>
                      <IconAlertTriangle />
                    </div>
                    {name}
                  </div>
                </Popover>
              );
            } else {
              return name;
            }
          },
        },
        {
          title: 'Listings',
          dataIndex: 'numberOfFoundListings',
          render: (value) => {
            return value || 0;
          },
        },
        {
          title: 'Provider',
          dataIndex: 'provider',
          render: (value) => {
            return value.length || 0;
          },
        },
        {
          title: 'Notification Adapter',
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
                <Popover content={getPopoverContent('Edit a Job')}>
                  <Button
                    type="secondary"
                    icon={<IconEdit />}
                    disabled={job.isOnlyShared}
                    onClick={() => onJobEdit(job.id)}
                  />
                </Popover>
                <Popover content={getPopoverContent('Delete all found Listings of this Job')}>
                  <Button
                    type="danger"
                    icon={<IconDescend2 />}
                    disabled={job.isOnlyShared}
                    onClick={() => onListingRemoval(job.id)}
                  />
                </Popover>
                <Popover content={getPopoverContent('Delete Job')}>
                  <Button
                    type="danger"
                    icon={<IconDelete />}
                    disabled={job.isOnlyShared}
                    onClick={() => onJobRemoval(job.id)}
                  />
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
