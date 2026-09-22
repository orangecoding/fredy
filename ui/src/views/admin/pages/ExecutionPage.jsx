/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { TimePicker, Checkbox, Input, InputNumber, Select } from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { useOutletContext } from 'react-router';
import { useMemo } from 'react';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import AdminField from '../components/AdminField.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { useSelector } from '../../../services/state/store';
import { relativeTime } from '../../../services/time/relativeTime.js';
import { timeZoneOptions } from '../../../services/time/timeService';
import './ExecutionPage.less';

/**
 * @param {number} ts
 * @returns {string}
 */
function formatFromTimestamp(ts) {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * @param {string|null} time HH:mm as the backend stores it.
 * @returns {number|null}
 */
function formatFromTBackend(time) {
  if (time == null || time.length === 0) {
    return null;
  }
  const date = new Date();
  const split = time.split(':');
  date.setHours(split[0]);
  date.setMinutes(split[1]);
  return date.getTime();
}

/**
 * How often Fredy searches, within which hours, through which proxy, and whether it re-checks
 * prices afterwards.
 *
 * @returns {React.ReactElement}
 */
export default function ExecutionPage() {
  const { t, form, setField, setWorkingHour, executionDirty, savingExecution, saveExecution, discardExecution } =
    useOutletContext();
  const zones = useMemo(() => timeZoneOptions(form.workingHours.timeZone), [form.workingHours.timeZone]);

  // Nur, was das Dashboard ohnehin schon geholt hat - dieselbe Quelle, aus der die Seitenleiste
  // liest. Diese Seite stellt das Suchintervall ein und war die einzige, die nicht sagt, wann der
  // naechste Lauf faellig ist.
  const nextRun = useSelector((state) => state.dashboard.data?.general?.nextRun);

  useUnsavedWarning(executionDirty);

  // Was die vier Regler zusammen bedeuten, in einem Satz. Einzeln sagen sie es nicht: ein leeres
  // Von und Bis heisst "rund um die Uhr", und das stand bisher nur im Hilfetext.
  const summary = useMemo(() => {
    const { from, to, timeZone } = form.workingHours;
    const zone = timeZone ?? t('admin.execution.serverZone');
    if (from == null || to == null || from === '' || to === '') {
      return t('admin.execution.summaryAllDay', { minutes: form.interval || '?' });
    }
    return t('admin.execution.summaryWindow', { minutes: form.interval || '?', from, to, zone });
  }, [form.interval, form.workingHours, t]);

  return (
    <div className="settingsShell__page">
      {/* Eine Karte statt zweier. Intervall, Von, Bis und Zeitzone sind vier Bedienelemente, die
          zusammen einen Sachverhalt beschreiben; als zwei Karten gelesen sagte keine von beiden,
          was die andere daran aendert. */}
      <SegmentPart
        name={t('admin.execution.searchRun')}
        helpText={t('settings.searchIntervalHelp')}
        helpMode="popover"
        action={
          nextRun != null && nextRun !== 0 ? (
            <span className="settingsShell__cardFlag">
              <span className="settingsShell__cardFlagDot settingsShell__cardFlagDot--ok" aria-hidden="true" />
              {t('nav.nextRun', { time: relativeTime(nextRun, t) })}
            </span>
          ) : null
        }
      >
        {/* Drei Zeilen, die sich wie ein Satz lesen: "Alle 60 Minuten", "Zwischen 08:00 und 20:00".
            Die Beschriftung steht daneben statt darueber, weil sie der Anfang des Satzes ist und
            nicht die Ueberschrift eines Feldes. */}
        <div className="executionPage__line">
          <span className="executionPage__caption">{t('admin.execution.every')}</span>
          <span className="adminRow__control">
            <InputNumber
              id="interval"
              min={5}
              max={1440}
              aria-label={t('settings.searchInterval')}
              placeholder={t('settings.searchIntervalPlaceholder')}
              value={form.interval}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('interval', value)}
              suffix={t('settings.searchIntervalSuffix')}
            />
          </span>
        </div>

        <div className="executionPage__line">
          <span className="executionPage__caption">{t('admin.execution.between')}</span>
          <TimePicker
            format={'HH:mm'}
            className="executionPage__time"
            value={formatFromTBackend(form.workingHours.from)}
            placeholder={t('settings.workingHoursFrom')}
            onChange={(val) => setWorkingHour('from', val == null ? null : formatFromTimestamp(val))}
          />
          <span className="executionPage__caption executionPage__caption--inline">{t('admin.execution.and')}</span>
          <TimePicker
            format={'HH:mm'}
            className="executionPage__time"
            value={formatFromTBackend(form.workingHours.to)}
            placeholder={t('settings.workingHoursUntil')}
            onChange={(val) => setWorkingHour('to', val == null ? null : formatFromTimestamp(val))}
          />
        </div>

        {/*
          Eigene Zeile, weil das Artboard die Zeitzone aus der Zwischen-Zeile heraushaelt - dort
          steht das Zeitfenster, und die Zone ist keine dritte Uhrzeit. Weggelassen wird sie
          nicht: der Satz darunter nennt sie, und irgendwo muss man sie setzen koennen.

          Searchable rather than a plain list: there are well over four hundred zones, and an
          operator knows the name of theirs. Clearable because an empty value is a real state -
          it means the window follows the server's own zone, which is what every installation
          did before this setting existed.
        */}
        <div className="executionPage__line">
          <span className="executionPage__caption">{t('settings.workingHoursTimeZone')}</span>
          <Select
            filter
            showClear
            className="executionPage__zone"
            optionList={zones}
            value={form.workingHours.timeZone ?? undefined}
            placeholder={t('settings.workingHoursTimeZonePlaceholder')}
            aria-label={t('settings.workingHoursTimeZone')}
            onChange={(val) => setWorkingHour('timeZone', val == null || val === '' ? null : val)}
          />
        </div>

        <div className="executionPage__summary">{summary}</div>
      </SegmentPart>

      <SegmentPart name={t('settings.proxyUrl')} helpText={t('settings.proxyUrlHelp')} helpMode="popover">
        <Input
          type="text"
          placeholder={t('settings.proxyUrlPlaceholder')}
          value={form.proxyUrl}
          onChange={(value) => setField('proxyUrl', value)}
        />
      </SegmentPart>

      {/*
        One block rather than four. The three dials are meaningless on their own - they only
        describe how the sweep behaves once it exists - so presenting them as peers of the switch
        invited reading them as four independent knobs. They stay visible while disabled so an
        operator can see what turning the feature on would commit them to.
      */}
      {/*
        Above the switch, not below it. Turning this on is the moment the operator takes on the
        risk, so the warning has to be in front of them beforehand, not revealed as a consequence.
        It sits in the card's own help now, which puts it ahead of the switch all the more: the
        help is read before the first control, and a warning behind a mark would have to be opened
        to be a warning at all.
      */}
      <SegmentPart
        name={t('settings.priceTracking')}
        helpText={
          <>
            {t('settings.priceTrackingHelp')}
            <span className="settingsShell__helpWarning">
              <IconAlertTriangle size="small" />
              <span>
                <strong>{t('settings.priceTrackingWarningTitle')}</strong> {t('settings.priceTrackingWarningBody')}{' '}
                {t('settings.priceTrackingWarningDefaults')}
              </span>
            </span>
          </>
        }
      >
        <Checkbox
          checked={form.priceTrackingEnabled}
          onChange={(e) => setField('priceTrackingEnabled', e.target.checked)}
        >
          {t('settings.priceTrackingEnabled')}
        </Checkbox>

        <div
          className={`settingsShell__subSettings${form.priceTrackingEnabled ? '' : ' settingsShell__subSettings--disabled'}`}
        >
          {/* Die Schiene bleibt - sie drueckt die Abhaengigkeit vom Schalter aus, und die ist
              echt. Was darin steht, sind Feldzeilen wie ueberall sonst: drei Erklaerungen von 15
              bis 25 Woertern untereinander waren dreimal dieselbe Entscheidung neu begruendet. */}
          <AdminField
            label={t('settings.priceCheckInterval')}
            help={t('settings.priceCheckIntervalHelp')}
            htmlFor="priceCheckIntervalDays"
          >
            <InputNumber
              id="priceCheckIntervalDays"
              min={1}
              max={30}
              disabled={!form.priceTrackingEnabled}
              value={form.priceCheckIntervalDays}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('priceCheckIntervalDays', value)}
              suffix={t('settings.listingRetentionSuffix')}
            />
          </AdminField>

          <AdminField
            label={t('settings.priceCheckLimit')}
            help={t('settings.priceCheckLimitHelp')}
            htmlFor="priceCheckLimitPerRun"
          >
            <InputNumber
              id="priceCheckLimitPerRun"
              min={1}
              max={500}
              disabled={!form.priceTrackingEnabled}
              value={form.priceCheckLimitPerRun}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('priceCheckLimitPerRun', value)}
            />
          </AdminField>

          <AdminField
            label={t('settings.priceChangeThreshold')}
            help={t('settings.priceChangeThresholdHelp')}
            htmlFor="priceChangeThresholdPercent"
          >
            <InputNumber
              id="priceChangeThresholdPercent"
              min={0}
              max={50}
              step={0.5}
              disabled={!form.priceTrackingEnabled}
              value={form.priceChangeThresholdPercent}
              onChange={(value) => setField('priceChangeThresholdPercent', value)}
              suffix="%"
            />
          </AdminField>
        </div>
      </SegmentPart>

      <SettingsSaveBar
        dirty={executionDirty}
        saving={savingExecution}
        onSave={saveExecution}
        onDiscard={discardExecution}
      />
    </div>
  );
}

ExecutionPage.displayName = 'ExecutionPage';
