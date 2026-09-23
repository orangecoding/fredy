/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Table, Toast } from '@douyinfe/semi-ui-19';
import { IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { xhrDelete, xhrGet, errorMessage } from '../../../services/xhr';
import { useLocale, useTranslation } from '../../../services/i18n/i18n.jsx';
import { format } from '../../../services/time/timeService';
import { relativeTime } from '../../../services/time/relativeTime.js';

import './ConnectionsPage.less';

/**
 * The MCP clients this user has let read their jobs and listings over OAuth, and the way to take
 * that back.
 *
 * Revoking is immediate and final for that client: its refresh tokens and any access token still
 * in flight stop working, and it has to ask for consent again to come back. There is no edit here
 * because there is nothing to edit - a grant is a yes or a no.
 *
 * What each one may do is shown rather than assumed. Write access is a separate scope, and a
 * connection approved before the write tools existed carries only `mcp:read` - it stays read-only
 * until its owner reconnects it, and this column is the only place that says so.
 *
 * @returns {React.ReactElement}
 */
export default function ConnectionsPage() {
  const t = useTranslation();
  const locale = useLocale();
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await xhrGet('/api/user/mcp-oauth-grants');
      setGrants(response.json ?? []);
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.connections.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (clientId) => {
    try {
      await xhrDelete(`/api/user/mcp-oauth-grants/${encodeURIComponent(clientId)}`);
      Toast.success(t('settings.connections.revoked'));
      setGrants((current) => current.filter((grant) => grant.clientId !== clientId));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.connections.revokeError')));
    }
  };

  const columns = [
    {
      title: t('settings.connections.columnClient'),
      dataIndex: 'clientName',
      render: (name) => name || t('settings.connections.unnamedClient'),
    },
    {
      title: t('settings.connections.columnAccess'),
      dataIndex: 'scopes',
      render: (scopes) => {
        const writes = (scopes ?? []).includes('mcp:write');
        return (
          <span className={`accessTag accessTag--${writes ? 'write' : 'read'}`}>
            {t(writes ? 'settings.connections.accessWrite' : 'settings.connections.accessRead')}
          </span>
        );
      },
    },
    {
      title: t('settings.connections.columnGrantedAt'),
      dataIndex: 'grantedAt',
      // Relativ, weil man von einer Freigabeliste wissen will, wie lange sie schon offen steht,
      // und nicht, auf welches Datum das fiel. Das genaue Datum steht im Titel.
      render: (grantedAt) => (
        <span title={format(grantedAt, false, locale)}>{relativeTime(grantedAt, t, Date.now())}</span>
      ),
    },
    {
      title: t('settings.connections.columnAction'),
      dataIndex: 'clientId',
      render: (clientId) => (
        <Popconfirm
          title={t('settings.connections.revokeConfirmTitle')}
          content={t('settings.connections.revokeConfirmText')}
          okType="danger"
          onConfirm={() => revoke(clientId)}
        >
          <Button type="danger" theme="borderless" size="small" icon={<IconDelete />}>
            {t('settings.connections.revoke')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.connections.title')} helpText={t('settings.connections.help')}>
        <Table
          pagination={false}
          rowKey="clientId"
          loading={loading}
          empty={<Empty description={t('settings.connections.empty')} />}
          columns={columns}
          dataSource={grants}
        />
      </SegmentPart>
    </div>
  );
}

ConnectionsPage.displayName = 'ConnectionsPage';
