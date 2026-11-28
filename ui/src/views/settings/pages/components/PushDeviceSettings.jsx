/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Table, Toast } from '@douyinfe/semi-ui-19';
import { IconDelete } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../../components/segment/SegmentPart.jsx';
import { errorMessage } from '../../../../services/xhr';
import { useLocale, useTranslation } from '../../../../services/i18n/i18n.jsx';
import { format } from '../../../../services/time/timeService';
import { relativeTime } from '../../../../services/time/relativeTime.js';
import {
  currentSubscription,
  deviceName,
  disablePush,
  enablePush,
  fetchPublicKey,
  listPushDevices,
  pushSupport,
  removePushDevice,
  sendTestPush,
} from '../../../../services/push/webPushClient.js';

import './PushDeviceSettings.less';

/** The status line for each thing a device can be told about push. */
const SUPPORT_MESSAGE = {
  insecure: 'settings.push.insecure',
  'ios-install': 'settings.push.iosInstall',
  unsupported: 'settings.push.unsupported',
  denied: 'settings.push.denied',
};

/**
 * "Push on this device": Web Push for the browser notification channel (#542).
 *
 * Push is per device, so it is switched on here, on the device, rather than in a channel's fields.
 * Every job that uses the browser channel then reaches every device listed below, with Fredy closed.
 *
 * The switch has to be a button: iOS only shows the permission prompt for a tap, which is why the
 * automatic prompt the app shows elsewhere never works there.
 *
 * @returns {React.ReactElement}
 */
export default function PushDeviceSettings() {
  const t = useTranslation();
  const locale = useLocale();
  const [support, setSupport] = useState(() => pushSupport());
  const [subscribedEndpoint, setSubscribedEndpoint] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subscription, list] = await Promise.all([currentSubscription(), listPushDevices()]);
      setSubscribedEndpoint(subscription?.endpoint ?? null);
      setDevices(list);
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.push.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    // Loaded ahead of the tap, so the subscription follows the permission prompt without a
    // network round trip in between, which iOS would no longer count as part of the gesture.
    if (support === 'available') {
      fetchPublicKey()
        .then(setPublicKey)
        .catch(() => {});
    }
  }, [load, support]);

  const enable = async () => {
    setBusy(true);
    try {
      const outcome = await enablePush(publicKey ?? undefined);
      if (outcome === 'enabled') {
        Toast.success(t('settings.push.enabled'));
      } else if (outcome === 'denied') {
        Toast.warning(t('settings.push.denied'));
      }
      setSupport(pushSupport());
      await load();
    } catch (error) {
      // A browser-side failure (no push service, a refused subscription) is an Error with a message
      // worth showing; a server answer carries its own.
      Toast.error(
        error instanceof Error
          ? `${t('settings.push.enableError')} ${error.message}`
          : errorMessage(error, t('settings.push.enableError')),
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disablePush();
      Toast.success(t('settings.push.disabled'));
      await load();
    } catch (error) {
      Toast.error(errorMessage(error, t('common.unknownError')));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const result = await sendTestPush();
      if (result?.sent > 0) {
        Toast.success(t('settings.push.testSent', { count: result.sent }));
      } else {
        Toast.warning(t('settings.push.testNone'));
      }
      await load();
    } catch (error) {
      Toast.error(errorMessage(error, t('common.unknownError')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (device) => {
    try {
      // This device is switched off the whole way, so the browser forgets the subscription too;
      // any other one can only be removed from the list and is gone for good on its next push.
      if (device.endpoint === subscribedEndpoint) {
        await disablePush();
      } else {
        await removePushDevice(device.id);
      }
      await load();
    } catch (error) {
      Toast.error(errorMessage(error, t('common.unknownError')));
    }
  };

  const supportMessage = SUPPORT_MESSAGE[support];
  const subscribed = support === 'available' && subscribedEndpoint != null;

  const columns = [
    {
      title: t('settings.push.columnDevice'),
      dataIndex: 'userAgent',
      render: (userAgent, device) => (
        <span title={userAgent ?? ''}>
          {deviceName(userAgent) ?? t('settings.push.unknownDevice')}
          {device.endpoint === subscribedEndpoint && (
            <span className="pushDevices__this">{t('settings.push.thisDevice')}</span>
          )}
        </span>
      ),
    },
    {
      title: t('settings.push.columnAdded'),
      dataIndex: 'createdAt',
      render: (createdAt) => (
        <span title={format(createdAt, false, locale)}>{relativeTime(createdAt, t, Date.now())}</span>
      ),
    },
    {
      title: t('settings.push.columnLastPush'),
      dataIndex: 'lastSuccessAt',
      render: (lastSuccessAt, device) => (
        <span>
          {lastSuccessAt ? (
            <span title={format(lastSuccessAt, false, locale)}>{relativeTime(lastSuccessAt, t, Date.now())}</span>
          ) : (
            t('settings.push.never')
          )}
          {device.lastError && (
            <span className="pushDevices__error" title={device.lastError}>
              {t('settings.push.lastError')}
            </span>
          )}
        </span>
      ),
    },
    {
      title: '',
      dataIndex: 'id',
      render: (id, device) => (
        <Popconfirm
          title={t('settings.push.removeConfirmTitle')}
          content={t('settings.push.removeConfirmText')}
          okType="danger"
          onConfirm={() => remove(device)}
        >
          <Button type="danger" theme="borderless" size="small" icon={<IconDelete />}>
            {t('settings.push.remove')}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <SegmentPart name={t('settings.push.title')} helpText={t('settings.push.help')}>
      <div className="pushDevices">
        <p className="pushDevices__status">
          {supportMessage ? t(supportMessage) : t(subscribed ? 'settings.push.on' : 'settings.push.off')}
        </p>
        {support === 'available' && (
          <div className="pushDevices__actions">
            {subscribed ? (
              <>
                <Button onClick={test} loading={busy}>
                  {t('settings.push.test')}
                </Button>
                <Button type="danger" onClick={disable} disabled={busy}>
                  {t('settings.push.disable')}
                </Button>
              </>
            ) : (
              <Button type="primary" theme="solid" onClick={enable} loading={busy}>
                {t('settings.push.enable')}
              </Button>
            )}
          </div>
        )}
        {(devices.length > 0 || loading) && (
          <Table
            className="pushDevices__table"
            size="small"
            pagination={false}
            rowKey="id"
            loading={loading}
            empty={<Empty description={t('settings.push.noDevices')} />}
            columns={columns}
            dataSource={devices}
          />
        )}
      </div>
    </SegmentPart>
  );
}

PushDeviceSettings.displayName = 'PushDeviceSettings';
