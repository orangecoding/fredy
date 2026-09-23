/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Dropdown, Empty, Tooltip, Toast } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEdit, IconCopy, IconKey, IconMore } from '@douyinfe/semi-icons';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { xhrGet } from '../../services/xhr.js';
import { copyToClipboard } from '../../services/clipboard.js';

import './UserTable.less';

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
   * @param {string} token
   * @returns {Promise<void>}
   */
  const copyToken = async (token) => {
    const copied = await copyToClipboard(token);
    if (copied) {
      Toast.success(t('users.mcpTokenCopied'));
    } else {
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
          /*
           * The token is a line under the name rather than a column of its own. As a column it was
           * 71 characters with `word-break: break-all` in a table cell, which made every row three
           * times as tall - for a value somebody copies once in their life.
           */
          render: (value, record) => (
            <div className="userTable__user">
              <span className="userTable__name">{value}</span>
              {record.isAdmin && <span className="userTable__admin">{t('users.tableAdminBadge')}</span>}
              {revealedTokens[record.id] && (
                <span className="userTable__token">
                  <code>{revealedTokens[record.id]}</code>
                  {/* A 71-character token is not something anyone should be selecting by hand. */}
                  <Button
                    size="small"
                    theme="borderless"
                    icon={<IconCopy />}
                    aria-label={t('users.mcpTokenCopy')}
                    onClick={() => copyToken(revealedTokens[record.id])}
                  />
                </span>
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
          /*
           * The same hierarchy as every other table here. The loudest element of this one used to
           * be Edit - a filled primary button on every row - with Remove next to it as a quieter
           * hand-built danger button, so the most harmless action shouted and the irreversible one
           * did not. Edit is an icon now, and removing takes a word in a menu.
           */
          title: t('users.tableColumnActions'),
          dataIndex: 'tools',
          render: (_, record) => (
            <div className="userTable__actions">
              <Tooltip content={t('users.editUser')}>
                <Button
                  size="small"
                  icon={<IconEdit />}
                  aria-label={t('users.editUser')}
                  onClick={() => onUserEdit(record.id)}
                />
              </Tooltip>
              <Dropdown
                trigger="click"
                position="bottomRight"
                clickToHide
                render={
                  <Dropdown.Menu>
                    <Dropdown.Item icon={<IconKey />} onClick={() => revealToken(record.id)}>
                      {t('users.mcpTokenReveal')}
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item type="danger" icon={<IconDelete />} onClick={() => onUserRemoval(record.id)}>
                      {t('users.removeUser')}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                }
              >
                <Button size="small" icon={<IconMore />} aria-label={t('listings.moreActions')} />
              </Dropdown>
            </div>
          ),
        },
      ]}
      dataSource={user}
    />
  );
}
