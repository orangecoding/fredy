import React from 'react';
import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';
import { NotificationAdapterConfig } from '#types/NotificationAdapter';

interface NotificationAdapterTableProps {
  notificationAdapter?: NotificationAdapterConfig[];
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export default function NotificationAdapterTable({
  notificationAdapter = [],
  onRemove,
  onEdit,
}: NotificationAdapterTableProps) {
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
          render: (_, record: NotificationAdapterConfig) => {
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
