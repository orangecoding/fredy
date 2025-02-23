// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Empty } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

const empty = (
  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  <Empty
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    image={<IllustrationNoResult />}
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    darkModeImage={<IllustrationNoResultDark />}
    description={'No user available'}
  />
);

export default function UserTable({
  user = [],
  onUserRemoval,
  onUserEdit
}: any = {}) {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
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
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              <div style={{ float: 'right' }}>
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button
                  type="danger"
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  icon={<IconDelete />}
                  onClick={() => onUserRemoval(user.id)}
                  style={{ marginRight: '1rem' }}
                />
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button type="primary" icon={<IconEdit />} onClick={() => onUserEdit(user.id)} />
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              </div>
            );
          },
        },
      ]}
      dataSource={user}
    />
  );
}
