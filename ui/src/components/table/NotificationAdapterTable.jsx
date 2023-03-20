import React from 'react';

import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

export default function NotificationAdapterTable({ notificationAdapter = [], onRemove, onEdit } = {}) {
  return (
    <Table
      pagination={false}
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
              <div style={{ float: 'right' }}>
                <Button
                  type="secondary"
                  icon={<IconEdit />}
                  onClick={() => onEdit(record.id)}
                  style={{ marginRight: '1rem' }}
                />
                <Button type="danger" icon={<IconDelete />} onClick={() => onRemove(record.id)} />
              </div>
            );
          },
        },
      ]}
      dataSource={notificationAdapter}
    />
  );
}
