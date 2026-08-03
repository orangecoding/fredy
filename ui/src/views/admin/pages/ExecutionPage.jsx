/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { TimePicker, Button, Checkbox, Input, InputNumber, Banner } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';
import { useOutletContext } from 'react-router-dom';

import { SegmentPart } from '../../../components/segment/SegmentPart';

/**
 * @param {number} ts
 * @returns {string}
 */
function formatFromTimestamp(ts) {
  const date = new Date(ts);
  return `${date.getHours()}:${date.getMinutes() > 9 ? date.getMinutes() : '0' + date.getMinutes()}`;
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
  const { t, form, setField, setWorkingHour, executionDirty, savingExecution, saveExecution } = useOutletContext();

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.searchInterval')} helpText={t('settings.searchIntervalHelp')}>
        <InputNumber
          min={5}
          max={1440}
          placeholder={t('settings.searchIntervalPlaceholder')}
          value={form.interval}
          formatter={(value) => `${value}`.replace(/\D/g, '')}
          onChange={(value) => setField('interval', value)}
          suffix={t('settings.searchIntervalSuffix')}
          style={{ maxWidth: 200 }}
        />
      </SegmentPart>

      <SegmentPart name={t('settings.workingHours')} helpText={t('settings.workingHoursHelp')}>
        <div className="settingsShell__timePickerContainer">
          <TimePicker
            format={'HH:mm'}
            insetLabel={t('settings.workingHoursFrom')}
            value={formatFromTBackend(form.workingHours.from)}
            placeholder=""
            onChange={(val) => setWorkingHour('from', val == null ? null : formatFromTimestamp(val))}
          />
          <TimePicker
            format={'HH:mm'}
            insetLabel={t('settings.workingHoursUntil')}
            value={formatFromTBackend(form.workingHours.to)}
            placeholder=""
            onChange={(val) => setWorkingHour('to', val == null ? null : formatFromTimestamp(val))}
          />
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.proxyUrl')} helpText={t('settings.proxyUrlHelp')}>
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
      <SegmentPart name={t('settings.priceTracking')} helpText={t('settings.priceTrackingHelp')}>
        {/*
          Above the switch, not below it. Turning this on is the moment the operator takes on the
          risk, so the warning has to be in front of them beforehand, not revealed as a consequence.
        */}
        <Banner
          fullMode={false}
          type="warning"
          closeIcon={null}
          style={{ marginBottom: '12px' }}
          title={t('settings.priceTrackingWarningTitle')}
          description={
            <>
              <p style={{ margin: '0 0 8px' }}>{t('settings.priceTrackingWarningBody')}</p>
              <p style={{ margin: 0 }}>{t('settings.priceTrackingWarningDefaults')}</p>
            </>
          }
        />

        <Checkbox
          checked={form.priceTrackingEnabled}
          onChange={(e) => setField('priceTrackingEnabled', e.target.checked)}
        >
          {t('settings.priceTrackingEnabled')}
        </Checkbox>

        <div
          className={`settingsShell__subSettings${form.priceTrackingEnabled ? '' : ' settingsShell__subSettings--disabled'}`}
        >
          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="priceCheckIntervalDays">
              {t('settings.priceCheckInterval')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.priceCheckIntervalHelp')}</p>
            <InputNumber
              id="priceCheckIntervalDays"
              min={1}
              max={30}
              disabled={!form.priceTrackingEnabled}
              value={form.priceCheckIntervalDays}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('priceCheckIntervalDays', value)}
              suffix={t('settings.listingRetentionSuffix')}
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="priceCheckLimitPerRun">
              {t('settings.priceCheckLimit')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.priceCheckLimitHelp')}</p>
            <InputNumber
              id="priceCheckLimitPerRun"
              min={1}
              max={500}
              disabled={!form.priceTrackingEnabled}
              value={form.priceCheckLimitPerRun}
              formatter={(value) => `${value}`.replace(/\D/g, '')}
              onChange={(value) => setField('priceCheckLimitPerRun', value)}
              style={{ maxWidth: 200 }}
            />
          </div>

          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="priceChangeThresholdPercent">
              {t('settings.priceChangeThreshold')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.priceChangeThresholdHelp')}</p>
            <InputNumber
              id="priceChangeThresholdPercent"
              min={0}
              max={50}
              step={0.5}
              disabled={!form.priceTrackingEnabled}
              value={form.priceChangeThresholdPercent}
              onChange={(value) => setField('priceChangeThresholdPercent', value)}
              suffix="%"
              style={{ maxWidth: 200 }}
            />
          </div>
        </div>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button
          type="primary"
          theme="solid"
          onClick={saveExecution}
          disabled={!executionDirty}
          loading={savingExecution}
          icon={<IconSave />}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

ExecutionPage.displayName = 'ExecutionPage';
