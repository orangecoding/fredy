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

/**
 * The MCP clients this user has let read their jobs and listings over OAuth, and the way to take
 * that back.
 *
 * Revoking is immediate and final for that client: its refresh tokens and any access token still
 * in flight stop working, and it has to ask for consent again to come back. There is no edit here
 * because there is nothing to edit - a grant is a yes or a no.
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
      title: t('settings.connections.columnGrantedAt'),
      dataIndex: 'grantedAt',
      render: (grantedAt) => format(grantedAt, false, locale),
    },
    {
      title: '',
      dataIndex: 'clientId',
      render: (clientId) => (
        <Popconfirm
          title={t('settings.connections.revokeConfirmTitle')}
          content={t('settings.connections.revokeConfirmText')}
          okType="danger"
          onConfirm={() => revoke(clientId)}
        >
          <Button type="danger" icon={<IconDelete />} size="small">
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
