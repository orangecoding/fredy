/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Empty } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description={'No users found.'}
  />
);

export default function UserTable({ user = [], onUserRemoval, onUserEdit } = {}) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: 'Username',
          dataIndex: 'username',
        },
        {
          title: 'Last login',
          dataIndex: 'lastLogin',
          render: (value) => {
            return format(value);
          },
        },
        {
          title: 'Number of jobs',
          dataIndex: 'numberOfJobs',
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (value, user) => {
            return (
              <div style={{ float: 'right' }}>
                <Button
                  type="danger"
                  icon={<IconDelete />}
                  onClick={() => onUserRemoval(user.id)}
                  style={{ marginRight: '1rem' }}
                />
                <Button type="primary" icon={<IconEdit />} onClick={() => onUserEdit(user.id)} />
              </div>
            );
          },
        },
      ]}
      dataSource={user}
    />
  );
}
