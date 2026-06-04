/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Empty, Tag } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

export default function UserTable({ user = [], onUserRemoval, onUserEdit } = {}) {
  const t = useTranslation();
  const locale = useLocale();
  const empty = (
    <Empty
      image={<IllustrationNoResult />}
      darkModeImage={<IllustrationNoResultDark />}
      description={t('users.emptyState')}
    />
  );
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: t('users.tableColumnUser'),
          dataIndex: 'username',
          render: (value, record) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                  {t('users.tableAdminBadge')}
                </Tag>
              )}
            </div>
          ),
        },
        {
          title: t('users.tableColumnLastLogin'),
          dataIndex: 'lastLogin',
          render: (value) => (value == null ? '---' : format(value, true, locale)),
        },
        {
          title: t('users.tableColumnJobs'),
          dataIndex: 'numberOfJobs',
        },
        {
          title: t('users.tableColumnMcpToken'),
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
