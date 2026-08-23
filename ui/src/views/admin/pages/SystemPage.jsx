/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Checkbox, Input, InputNumber, Banner } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';
import { useOutletContext } from 'react-router';

import { SegmentPart } from '../../../components/segment/SegmentPart';

/**
 * The reverse-proxy sign-in inputs, rendered from one template: they share label, help and
 * placeholder keys by name, and differ only in whether they hold a secret.
 * @type {{name: string, secret?: boolean}[]}
 */
const PROXY_AUTH_FIELDS = [
  { name: 'proxyAuthTrustedProxies' },
  { name: 'proxyAuthUserHeader' },
  { name: 'proxyAuthSecretHeader' },
  { name: 'proxyAuthSecret', secret: true },
];

/**
 * How the instance runs: the port it listens on, where it thinks it lives, how long a session
 * lasts, how long listings are kept, where the database file is.
 *
 * @returns {React.ReactElement}
 */
export default function SystemPage() {
  const { t, form, setField, systemDirty, savingSystem, saveSystem } = useOutletContext();

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.port')} helpText={t('settings.portHelp')}>
        <InputNumber
          min={0}
          max={99999}
          placeholder={t('settings.portPlaceholder')}
          value={form.port}
          formatter={(value) => `${value}`.replace(/\D/g, '')}
          onChange={(value) => setField('port', value)}
          style={{ maxWidth: 160 }}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.baseUrl')} helpText={t('settings.baseUrlHelp')}>
        <Input
          type="text"
          placeholder={t('settings.baseUrlPlaceholder')}
          value={form.baseUrl}
          onChange={(value) => setField('baseUrl', value)}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.sessionTTL')} helpText={t('settings.sessionTTLHelp')}>
        <Input
          type="text"
          placeholder={t('settings.sessionTTLPlaceholder')}
          value={form.sessionTTL}
          onChange={(value) => setField('sessionTTL', value)}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.listingRetention')} helpText={t('settings.listingRetentionHelp')}>
        <InputNumber
          min={0}
          max={365}
          placeholder={t('settings.listingRetentionPlaceholder')}
          value={form.listingRetentionDays}
          formatter={(value) => `${value}`.replace(/\D/g, '')}
          onChange={(value) => setField('listingRetentionDays', value)}
          suffix={t('settings.listingRetentionSuffix')}
          style={{ maxWidth: 200 }}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.sqlitePath')} helpText={t('settings.sqlitePathHelp')}>
        <Banner
          fullMode={false}
          type="warning"
          closeIcon={null}
          style={{ marginBottom: '12px' }}
          description={t('settings.sqlitePathWarning')}
        />
        <Input
          type="text"
          placeholder={t('settings.sqlitePathPlaceholder')}
          value={form.sqlitepath}
          onChange={(value) => setField('sqlitepath', value)}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.analytics')} helpText={t('settings.analyticsHelp')}>
        <Checkbox checked={form.analyticsEnabled} onChange={(e) => setField('analyticsEnabled', e.target.checked)}>
          {t('settings.analyticsEnable')}
        </Checkbox>
      </SegmentPart>

      <SegmentPart name={t('settings.demoMode')} helpText={t('settings.demoModeHelp')}>
        <Checkbox checked={form.demoMode} onChange={(e) => setField('demoMode', e.target.checked)}>
          {t('settings.demoModeEnable')}
        </Checkbox>
      </SegmentPart>

      <SegmentPart name={t('settings.proxyAuth')} helpText={t('settings.proxyAuthHelp')}>
        <Banner
          fullMode={false}
          type="warning"
          closeIcon={null}
          style={{ marginBottom: '12px' }}
          description={t('settings.proxyAuthWarning')}
        />
        <Checkbox checked={form.proxyAuthEnabled} onChange={(e) => setField('proxyAuthEnabled', e.target.checked)}>
          {t('settings.proxyAuthEnable')}
        </Checkbox>

        <div
          className={`settingsShell__subSettings${form.proxyAuthEnabled ? '' : ' settingsShell__subSettings--disabled'}`}
        >
          {PROXY_AUTH_FIELDS.map(({ name, secret }) => (
            <div className="settingsShell__subSetting" key={name}>
              <label className="settingsShell__subSetting__label" htmlFor={name}>
                {t(`settings.${name}`)}
              </label>
              <p className="settingsShell__subSetting__help">{t(`settings.${name}Help`)}</p>
              <Input
                id={name}
                type={secret ? 'password' : 'text'}
                mode={secret ? 'password' : undefined}
                autoComplete={secret ? 'new-password' : undefined}
                disabled={!form.proxyAuthEnabled}
                placeholder={t(`settings.${name}Placeholder`)}
                value={form[name]}
                onChange={(value) => setField(name, value)}
              />
            </div>
          ))}
        </div>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button
          type="primary"
          theme="solid"
          onClick={saveSystem}
          disabled={!systemDirty}
          loading={savingSystem}
          icon={<IconSave />}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

SystemPage.displayName = 'SystemPage';
