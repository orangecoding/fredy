// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

export default function NotificationAdapterTable({
  notificationAdapter = [],
  onRemove,
  onEdit
}: any = {}) {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Table
      pagination={false}
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      empty={<Empty description="No Data" />}
      columns={[
        {
          title: 'Notification Adapter Name',
          dataIndex: 'name',
        },

        {
          title: '',
          dataIndex: 'tools',
          render: (_, record) => {
            return (
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              <div style={{ float: 'right' }}>
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button
                  type="secondary"
                  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                  icon={<IconEdit />}
                  onClick={() => onEdit(record.id)}
                  style={{ marginRight: '1rem' }}
                />
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Button type="danger" icon={<IconDelete />} onClick={() => onRemove(record.id)} />
              // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
              </div>
            );
          },
        },
      ]}
      dataSource={notificationAdapter}
    />
  );
}
