/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { Empty, Table, Button } from '@douyinfe/semi-ui';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

export default function ProviderTable({ providerData = [], onRemove, onEdit } = {}) {
  return (
    <Table
      pagination={false}
      empty={<Empty description="No providers found." />}
      columns={[
        {
          title: 'Name',
          dataIndex: 'name',
        },
        {
          title: 'URL',
          dataIndex: 'url',
          render: (_, data) => {
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
          render: (_, record) => {
            return (
              <div style={{ float: 'right' }}>
                <Button type="secondary" icon={<IconEdit />} onClick={() => onEdit(record)} />
                <div style={{ display: 'inline-block', width: '16px' }} />
                <Button type="danger" icon={<IconDelete />} onClick={() => onRemove(record.url)} />
              </div>
            );
          },
        },
      ]}
      dataSource={providerData}
    />
  );
}
