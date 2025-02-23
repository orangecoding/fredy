import React from 'react';
import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '#ui_services/time/timeService';
import { User } from '#types/User.ts';

interface UserTableProps {
  user: User[];
  onUserRemoval: (userId: string) => void;
  onUserEdit: (userId: string) => void;
}

const empty = (
  <Empty image={<IllustrationNoResult />} darkModeImage={<IllustrationNoResultDark />} description={'No Data'} />
);

export default function UserTable({ user = [], onUserRemoval, onUserEdit }: UserTableProps) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: 'Username',
          dataIndex: 'username',
          key: 'username',
        },
        {
          title: 'Last login',
          dataIndex: 'lastLogin',
          key: 'lastLogin',
          render: (value: number) => format(value),
        },
        {
          title: 'Number of jobs',
          dataIndex: 'numberOfJobs',
          key: 'numberOfJobs',
        },
        {
          title: '',
          dataIndex: 'tools',
          key: 'tools',
          render: (value: string, record: User) => (
            <div style={{ float: 'right' }}>
              <Button
                type="danger"
                icon={<IconDelete />}
                onClick={() => onUserRemoval(record.id)}
                style={{ marginRight: '1rem' }}
              />
              <Button type="primary" icon={<IconEdit />} onClick={() => onUserEdit(record.id)} />
            </div>
          ),
        },
      ]}
      dataSource={user}
    />
  );
}
