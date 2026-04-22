/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Empty, Tag, Avatar } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

const empty = (
  <Empty image={<IllustrationNoResult />} darkModeImage={<IllustrationNoResultDark />} description="No users found." />
);

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function UserTable({ user = [], onUserRemoval, onUserEdit } = {}) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: 'User',
          dataIndex: 'username',
          render: (value, record) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                size="small"
                style={{
                  background: record.isAdmin ? 'rgba(224,74,56,0.15)' : 'rgba(148,163,184,0.12)',
                  border: `1px solid ${record.isAdmin ? 'rgba(224,74,56,0.4)' : 'rgba(148,163,184,0.2)'}`,
                  color: record.isAdmin ? '#e04a38' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getInitials(value)}
              </Avatar>
              <span style={{ color: '#efefef', fontWeight: 500 }}>{value}</span>
              {record.isAdmin && (
                <Tag
                  size="small"
                  style={{
                    background: 'rgba(224,74,56,0.12)',
                    border: '1px solid rgba(224,74,56,0.35)',
                    color: '#e04a38',
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    padding: '0 8px',
                  }}
                >
                  ADMIN
                </Tag>
              )}
            </div>
          ),
        },
        {
          title: 'Last login',
          dataIndex: 'lastLogin',
          render: (value) => format(value),
        },
        {
          title: 'Jobs',
          dataIndex: 'numberOfJobs',
        },
        {
          title: 'MCP Token',
          dataIndex: 'mcpToken',
          render: (value) => (
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.85em',
                wordBreak: 'break-all',
                color: '#505050',
              }}
            >
              {value || '---'}
            </span>
          ),
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, record) => (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(251,113,133,0.2)',
                  color: '#fb7185',
                }}
                icon={<IconDelete />}
                onClick={() => onUserRemoval(record.id)}
              />
              <Button type="primary" theme="solid" icon={<IconEdit />} onClick={() => onUserEdit(record.id)} />
            </div>
          ),
        },
      ]}
      dataSource={user}
    />
  );
}
