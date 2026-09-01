/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Checkbox, Input, InputNumber } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';
import { useOutletContext } from 'react-router';

import { SegmentPart } from '../../../components/segment/SegmentPart';

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
  const { t, form, setField, routingDirty, savingRouting, saveRouting } = useOutletContext();

  /**
   * One bounded number, with its own explanation.
   *
   * @param {Object} props
   * @returns {React.ReactElement}
   */
  const Dial = ({ name, min, max, suffix, disabled }) => (
    <div className="settingsShell__subSetting">
      <label className="settingsShell__subSetting__label" htmlFor={name}>
        {t(`settings.${name}`)}
      </label>
      <p className="settingsShell__subSetting__help">{t(`settings.${name}Help`)}</p>
      <InputNumber
        id={name}
        min={min}
        max={max}
        disabled={disabled}
        value={form[name]}
        formatter={(value) => `${value}`.replace(/\D/g, '')}
        onChange={(value) => setField(name, value)}
        suffix={suffix}
        style={{ maxWidth: 200 }}
      />
    </div>
  );

  return (
    <div className="settingsShell__page">
      <SegmentPart name={t('settings.routingTravelTime')} helpText={t('settings.routingTravelTimeHelp')}>
        <div className="settingsShell__subSettings">
          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="motisBaseUrl">
              {t('settings.motisBaseUrl')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.motisBaseUrlHelp')}</p>
            <Input
              id="motisBaseUrl"
              value={form.motisBaseUrl}
              placeholder="https://api.transitous.org/api"
              onChange={(value) => setField('motisBaseUrl', value)}
            />
          </div>

          <Dial name="travelTimeLimitPerRun" min={1} max={5000} />
          <Dial name="travelTimeMaxAgeDays" min={1} max={365} suffix={t('settings.listingRetentionSuffix')} />
          <Dial name="travelTimeMaxMinutes" min={15} max={180} suffix={t('settings.routingMinutesSuffix')} />
          <Dial name="travelTimeStreetLookupsPerRun" min={0} max={500} />
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.routingPlaces')} helpText={t('settings.routingPlacesHelp')}>
        <Checkbox checked={form.poiEnabled} onChange={(e) => setField('poiEnabled', e.target.checked)}>
          {t('settings.poiEnabled')}
        </Checkbox>

        {/* Visible while switched off rather than hidden, the same way the connectivity dials are:
            an operator deciding whether to turn this on should be able to see what it commits them
            to before they do. */}
        <div className={`settingsShell__subSettings${form.poiEnabled ? '' : ' settingsShell__subSettings--disabled'}`}>
          <div className="settingsShell__subSetting">
            <label className="settingsShell__subSetting__label" htmlFor="overpassBaseUrl">
              {t('settings.overpassBaseUrl')}
            </label>
            <p className="settingsShell__subSetting__help">{t('settings.overpassBaseUrlHelp')}</p>
            <Input
              id="overpassBaseUrl"
              disabled={!form.poiEnabled}
              value={form.overpassBaseUrl}
              placeholder="https://overpass-api.de/api/interpreter"
              onChange={(value) => setField('overpassBaseUrl', value)}
            />
          </div>

          <Dial name="poiLookupsPerRun" min={0} max={500} disabled={!form.poiEnabled} />
          <Dial
            name="poiCacheMaxAgeDays"
            min={1}
            max={365}
            suffix={t('settings.listingRetentionSuffix')}
            disabled={!form.poiEnabled}
          />
        </div>
      </SegmentPart>

      <div className="settingsShell__saveRow">
        <Button
          type="primary"
          theme="solid"
          onClick={saveRouting}
          disabled={!routingDirty}
          loading={savingRouting}
          icon={<IconSave />}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

RoutingPage.displayName = 'RoutingPage';
