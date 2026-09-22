/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { InputNumber, Switch } from '@douyinfe/semi-ui-19';
import { useOutletContext } from 'react-router';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import AdminField from '../components/AdminField.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { CONNECTIVITY_SOURCES } from '../../../components/connectivity/connectivityFormat.js';

import './ConnectivityPage.less';

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
  const { t, form, setField, connectivityDirty, savingConnectivity, saveConnectivity, discardConnectivity } =
    useOutletContext();

  useUnsavedWarning(connectivityDirty);

  const setSource = (id, enabled) => {
    setField('connectivitySources', { ...form.connectivitySources, [id]: enabled });
  };

  return (
    <div className="settingsShell__page">
      {/*
        Der Schalter steht im Kartenkopf, weil er ueber die ganze Karte entscheidet und nicht ueber
        eine Zeile darin. Als Erstes im Rumpf zu stehen und alles darunter zu dimmen, sagte dasselbe
        umstaendlicher - und brauchte dafuer eine Schiene, die die Karte gegen sich selbst einrueckt.
        Die Hilfe der Quellen haengt an der Kartenhilfe, weil sie genau das erklaert, was die Karte
        tut; von den drei Ebenen Hilfe bleiben damit die der Karte und die je Quelle.
      */}
      <SegmentPart
        name={t('settings.connectivity')}
        helpText={`${t('settings.connectivityHelp')} ${t('settings.connectivitySourcesHelp')}`}
        action={
          <Switch
            size="small"
            checked={form.connectivityEnabled}
            onChange={(value) => setField('connectivityEnabled', value)}
            aria-label={t('settings.connectivityEnabled')}
          />
        }
      >
        {/* Ein `<label>` ohne `htmlFor` und ohne Bedienelement darin ist fuer eine
            Bildschirmleseanwendung schlechter als gar keines. Hier steht deshalb ein Gruppentitel,
            und die Beschriftung traegt jede Quelle selbst. */}
        <div className="settingsShell__groupTitle">{t('settings.connectivitySources')}</div>
        {CONNECTIVITY_SOURCES.map((id) => (
          <AdminField
            key={id}
            label={t(`settings.connectivitySource.${id}`)}
            help={t(`settings.connectivitySourceHelp.${id}`)}
            htmlFor={`source-${id}`}
          >
            <Switch
              id={`source-${id}`}
              size="small"
              disabled={!form.connectivityEnabled}
              checked={form.connectivitySources?.[id] !== false}
              onChange={(value) => setSource(id, value)}
            />
          </AdminField>
        ))}

        {/* Nur eine Linie, kein zweiter Gruppentitel: dass unter den Quellen das Budget steht,
            sagen die beiden Zeilen selbst - eine Ueberschrift darueber waere die dritte Ebene,
            die diese Karte gerade losgeworden ist. */}
        <div className="connectivityPage__budget">
          <AdminField
            label={t('settings.connectivityLimit')}
            help={t('settings.connectivityLimitHelp')}
            htmlFor="connectivityLimitPerRun"
          >
            <InputNumber
              id="connectivityLimitPerRun"
              min={1}
              max={1000}
              disabled={!form.connectivityEnabled}
              value={form.connectivityLimitPerRun}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('connectivityLimitPerRun', value)}
            />
          </AdminField>

          <AdminField
            label={t('settings.connectivityMaxAge')}
            help={t('settings.connectivityMaxAgeHelp')}
            htmlFor="connectivityMaxAgeDays"
          >
            <InputNumber
              id="connectivityMaxAgeDays"
              min={7}
              max={730}
              disabled={!form.connectivityEnabled}
              value={form.connectivityMaxAgeDays}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('connectivityMaxAgeDays', value)}
              suffix={t('settings.listingRetentionSuffix')}
            />
          </AdminField>
        </div>
      </SegmentPart>

      <SettingsSaveBar
        dirty={connectivityDirty}
        saving={savingConnectivity}
        onSave={saveConnectivity}
        onDiscard={discardConnectivity}
      />
    </div>
  );
}

ConnectivityPage.displayName = 'ConnectivityPage';
