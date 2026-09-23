/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Checkbox, Input, InputNumber, Progress } from '@douyinfe/semi-ui-19';
import { useOutletContext } from 'react-router';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import AdminField from '../components/AdminField.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { xhrGet } from '../../../services/xhr';
import '../../settings/pages/travelTimePage.less';

/**
 * The bounded numbers this page offers, as data.
 *
 * They used to be six calls to a `Dial` declared inside the component body - which is how the
 * input lost focus after every keystroke: a component defined in a render body is a new type on
 * every render, so React threw the input away and built a new one. A table plus one shared field
 * component cannot do that, and it also cannot let the six drift apart.
 *
 * @type {ReadonlyArray<{name: string, min: number, max: number, suffixKey?: string, group: 'travel'|'places'}>}
 */
const DIALS = Object.freeze([
  { name: 'travelTimeLimitPerRun', min: 1, max: 5000, group: 'travel' },
  { name: 'travelTimeMaxAgeDays', min: 1, max: 365, suffixKey: 'settings.listingRetentionSuffix', group: 'travel' },
  { name: 'travelTimeMaxMinutes', min: 15, max: 180, suffixKey: 'settings.routingMinutesSuffix', group: 'travel' },
  { name: 'travelTimeStreetLookupsPerRun', min: 0, max: 500, group: 'travel' },
  { name: 'poiLookupsPerRun', min: 0, max: 500, group: 'places' },
  { name: 'poiCacheMaxAgeDays', min: 1, max: 365, suffixKey: 'settings.listingRetentionSuffix', group: 'places' },
]);

/**
 * How Fredy works out travel times, and how hard it leans on the services that answer them.
 *
 * Every dial here is a promise about somebody else's server. Transitous is a community MOTIS
 * instance and Overpass is donated hardware; both ask for fair use rather than naming a number, and
 * these are where an operator says what fair means for their instance.
 *
 * The two endpoints are here for the same reason: both services reserve the right to stop serving
 * any consumer, so an instance that outgrows the public one needs somewhere else to point without a
 * code change. Left empty they fall back to the built-in default, which is how a change is undone.
 *
 * @returns {React.ReactElement}
 */
export default function RoutingPage() {
  const { t, form, setField, routingDirty, savingRouting, saveRouting, discardRouting } = useOutletContext();
  const [progress, setProgress] = useState(null);

  useUnsavedWarning(routingDirty);

  // Einmal beim Betreten, nicht auf einem Timer: der Sweeper laeuft alle zwei Stunden, ein Poll
  // zeigte dieselbe Zahl noch einmal. Dieselbe Abfrage, die die Fahrzeit-Seite der Einstellungen
  // benutzt - die Zahl, gegen die diese Regler eingestellt werden, ist dieselbe.
  useEffect(() => {
    xhrGet('/api/user/settings/travel-time-progress')
      .then((response) => {
        if (response.status === 200) setProgress(response.json);
      })
      .catch(() => {});
  }, []);

  /**
   * The dials of one half of the page, as field rows.
   *
   * @param {'travel'|'places'} group
   * @param {boolean} disabled
   * @returns {React.ReactElement[]}
   */
  const dialsOf = (group, disabled) =>
    DIALS.filter((dial) => dial.group === group).map(({ name, min, max, suffixKey }) => (
      <AdminField key={name} label={t(`settings.${name}`)} help={t(`settings.${name}Help`)} htmlFor={name}>
        <InputNumber
          id={name}
          min={min}
          max={max}
          disabled={disabled}
          value={form[name]}
          formatter={(value) => `${value}`.replace(/\D/g, '')}
          onChange={(value) => setField(name, value)}
          suffix={suffixKey == null ? undefined : t(suffixKey)}
        />
      </AdminField>
    ));

  return (
    <div className="settingsShell__page">
      <SegmentPart
        name={t('settings.routingTravelTime')}
        helpText={t('settings.routingTravelTimeHelp')}
        helpMode="popover"
      >
        {/* Wie weit der Sweeper gekommen ist, ueber den Feldern: diese Seite setzt Budgets gegen
            fremde Dienste und sagte bisher nicht, wie viel davon verbraucht wird. Ein Balken nur,
            solange noch etwas offen ist - ein dauerhaft voller waere Dekoration. */}
        {progress != null && progress.total > 0 && (
          <div className="travelTimePage__progress">
            {progress.measured < progress.total && (
              <Progress
                percent={Math.round((progress.measured / progress.total) * 100)}
                aria-label={t('settings.travelTimeProgress', progress)}
                size="small"
                className="travelTimePage__progressBar"
              />
            )}
            <span className="travelTimePage__progressText">
              {progress.measured < progress.total
                ? t('settings.travelTimeProgress', progress)
                : t('settings.travelTimeProgressAll', progress)}
            </span>
          </div>
        )}

        {/* Keine Schiene mehr um diese vier Zeilen: sie hingen an keinem Schalter, waren aber
            eingerueckt und rule-markiert und drueckten damit eine Abhaengigkeit aus, die es nicht
            gibt. Die Orte-Karte darunter behaelt ihre, weil ihre echt ist. */}
        <AdminField
          wide
          label={t('settings.motisBaseUrl')}
          help={t('settings.motisBaseUrlHelp')}
          htmlFor="motisBaseUrl"
        >
          <Input
            id="motisBaseUrl"
            value={form.motisBaseUrl}
            placeholder="https://api.transitous.org/api"
            onChange={(value) => setField('motisBaseUrl', value)}
          />
        </AdminField>

        {dialsOf('travel', false)}
      </SegmentPart>

      <SegmentPart name={t('settings.routingPlaces')} helpText={t('settings.routingPlacesHelp')} helpMode="popover">
        <Checkbox checked={form.poiEnabled} onChange={(e) => setField('poiEnabled', e.target.checked)}>
          {t('settings.poiEnabled')}
        </Checkbox>

        {/* Visible while switched off rather than hidden, the same way the connectivity dials are:
            an operator deciding whether to turn this on should be able to see what it commits them
            to before they do. */}
        <div className={`settingsShell__subSettings${form.poiEnabled ? '' : ' settingsShell__subSettings--disabled'}`}>
          <AdminField
            wide
            label={t('settings.overpassBaseUrl')}
            help={t('settings.overpassBaseUrlHelp')}
            htmlFor="overpassBaseUrl"
          >
            <Input
              id="overpassBaseUrl"
              disabled={!form.poiEnabled}
              value={form.overpassBaseUrl}
              placeholder="https://overpass-api.de/api/interpreter"
              onChange={(value) => setField('overpassBaseUrl', value)}
            />
          </AdminField>

          {dialsOf('places', !form.poiEnabled)}
        </div>
      </SegmentPart>

      <SettingsSaveBar dirty={routingDirty} saving={savingRouting} onSave={saveRouting} onDiscard={discardRouting} />
    </div>
  );
}

RoutingPage.displayName = 'RoutingPage';
