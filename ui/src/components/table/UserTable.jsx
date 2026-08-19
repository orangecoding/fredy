/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Empty, Tag, Toast } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEdit, IconCopy } from '@douyinfe/semi-icons';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { xhrGet } from '../../services/xhr.js';

export default function UserTable({ user = [], onUserRemoval, onUserEdit } = {}) {
  const t = useTranslation();
  const locale = useLocale();
  /**
   * MCP tokens revealed so far, by user id. They are fetched on demand rather than shipped with
   * the user list: a token is a permanent bearer credential, and having every user's sitting in
   * the browser for the whole session is a needless place to lose them from.
   */
  const [revealedTokens, setRevealedTokens] = useState({});

  const revealToken = async (userId) => {
    try {
      const response = await xhrGet(`/api/admin/users/${userId}/mcp-token`);
      setRevealedTokens((previous) => ({ ...previous, [userId]: response.json.mcpToken }));
    } catch (error) {
      console.error('Error while trying to load the MCP token.', error);
      Toast.error(t('users.mcpTokenLoadError'));
    }
  };

  /**
   * Put a revealed token on the clipboard.
   *
   * Falls back to a hidden textarea and `execCommand`, because the Clipboard API is only available
   * on secure origins - and a self-hosted Fredy reached over plain http on the LAN is exactly the
   * setup where somebody is copying a token to paste into their MCP client.
   *
   * @param {string} token
   * @returns {Promise<void>}
   */
  const copyToken = async (token) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token);
      } else {
        const scratch = document.createElement('textarea');
        scratch.value = token;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.appendChild(scratch);
        scratch.select();
        document.execCommand('copy');
        document.body.removeChild(scratch);
      }
      Toast.success(t('users.mcpTokenCopied'));
    } catch (error) {
      console.error('Error while trying to copy the MCP token.', error);
      Toast.error(t('users.mcpTokenCopyError'));
    }
  };

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
              <span style={{ color: 'var(--f-text)', fontWeight: 500 }}>{value}</span>
              {record.isAdmin && (
                <Tag
                  size="small"
                  style={{
                    background: 'rgb(var(--f-accent-rgb) / 12%)',
                    border: '1px solid rgb(var(--f-accent-rgb) / 35%)',
                    color: 'var(--f-accent)',
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
          dataIndex: 'id',
          render: (userId) =>
            revealedTokens[userId] ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.85em',
                    wordBreak: 'break-all',
                    color: 'var(--f-faint)',
                  }}
                >
                  {revealedTokens[userId]}
                </span>
                {/* A 71-character token is not something anyone should be selecting by hand. */}
                <Button
                  size="small"
                  theme="borderless"
                  icon={<IconCopy />}
                  aria-label={t('users.mcpTokenCopy')}
                  onClick={() => copyToken(revealedTokens[userId])}
                />
              </div>
            ) : (
              <Button size="small" theme="borderless" onClick={() => revealToken(userId)}>
                {t('users.mcpTokenReveal')}
              </Button>
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
                  border: '1px solid rgb(var(--f-error-rgb) / 20%)',
                  color: 'var(--f-error)',
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
