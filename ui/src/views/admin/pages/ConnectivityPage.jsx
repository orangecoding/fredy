/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Checkbox, InputNumber } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';
import { useOutletContext } from 'react-router';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import { CONNECTIVITY_SOURCES } from '../../../components/connectivity/connectivityFormat.js';

/**
 * Whether Fredy looks up what internet connection a listing's address has, and from whom.
 *
 * Its own page rather than a block on Execution, because the per-source switches need room and
 * because they are a different kind of decision from the rest: not how Fredy behaves, but which
 * outside services it is willing to talk to.
 *
 * @returns {React.ReactElement}
 */
export default function ConnectivityPage() {
  const { t, form, setField, connectivityDirty, savingConnectivity, saveConnectivity } = useOutletContext();

  const setSource = (id, enabled) => {
    setField('connectivitySources', { ...form.connectivitySources, [id]: enabled });
  };

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.connectivity')} helpText={t('settings.connectivityHelp')}>
        <Checkbox
          checked={form.connectivityEnabled}
          onChange={(e) => setField('connectivityEnabled', e.target.checked)}
        >
          {t('settings.connectivityEnabled')}
        </Checkbox>

        {/*
          Visible while disabled rather than hidden, the same way the price tracking dials are: an
          operator deciding whether to switch this on should be able to see what it would commit
          them to.
        */}
        <div
          className={`settingsShell__subSettings${form.connectivityEnabled ? '' : ' settingsShell__subSettings--disabled'}`}
        >
          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label">{t('settings.connectivitySources')}</label>
            <p className="settingsShell__subSetting__help">{t('settings.connectivitySourcesHelp')}</p>
            {CONNECTIVITY_SOURCES.map((id) => (
              <div key={id}>
                <Checkbox
                  disabled={!form.connectivityEnabled}
                  checked={form.connectivitySources?.[id] !== false}
                  onChange={(e) => setSource(id, e.target.checked)}
                >
                  {t(`settings.connectivitySource.${id}`)}
                </Checkbox>
                <p className="settingsShell__subSetting__help">{t(`settings.connectivitySourceHelp.${id}`)}</p>
              </div>
            ))}
          </div>

          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="connectivityLimitPerRun">
              {t('settings.connectivityLimit')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.connectivityLimitHelp')}</p>
            <InputNumber
              id="connectivityLimitPerRun"
              min={1}
              max={1000}
              disabled={!form.connectivityEnabled}
              value={form.connectivityLimitPerRun}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('connectivityLimitPerRun', value)}
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="connectivityMaxAgeDays">
              {t('settings.connectivityMaxAge')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.connectivityMaxAgeHelp')}</p>
            <InputNumber
              id="connectivityMaxAgeDays"
              min={7}
              max={730}
              disabled={!form.connectivityEnabled}
              value={form.connectivityMaxAgeDays}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('connectivityMaxAgeDays', value)}
              suffix={t('settings.listingRetentionSuffix')}
              style={{ maxWidth: 200 }}
            />
          </div>
        </div>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button
          type="primary"
          theme="solid"
          onClick={saveConnectivity}
          disabled={!connectivityDirty}
          loading={savingConnectivity}
          icon={<IconSave />}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

ConnectivityPage.displayName = 'ConnectivityPage';
