import React from 'react';
import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete } from '@douyinfe/semi-icons';
import { Provider } from 'ui/src/types';

interface ProviderTableProps {
  providerData?: Provider[];
  onRemove: (id: string) => void;
}

export default function ProviderTable({ providerData = [], onRemove }: ProviderTableProps) {
  return (
    <Table
      pagination={false}
      empty={<Empty description="No Provider available" />}
      columns={[
        {
          title: 'Provider Name',
          dataIndex: 'name',
        },
        {
          title: 'Provider Url',
          dataIndex: 'url',
          render: (_, data: Provider) => {
            return (
              <a href={data.url} target="_blank" rel="noopener noreferrer">
                Visit site
              </a>
            );
          },
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, record: Provider) => {
            return (
              <div style={{ float: 'right' }}>
                <Button type="danger" icon={<IconDelete />} onClick={() => onRemove(record.id)} />
              </div>
            );
          },
        },
      ]}
      dataSource={providerData}
    />
  );
}
