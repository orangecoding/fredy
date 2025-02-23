import React, { useState, useEffect, ChangeEvent } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Divider, TimePicker, Button, Checkbox, InputNumber, Banner, Toast } from '@douyinfe/semi-ui';
import {
  IconSave,
  IconCalendar,
  IconRefresh,
  IconSignal,
  IconLineChartStroked,
  IconSearch,
} from '@douyinfe/semi-icons';
import Headline from '../../components/headline/Headline';
import { parseError, xhrPost } from '#ui_services/xhr.ts';
import { SegmentPart } from '../../components/segment/SegmentPart';
import './GeneralSettings.less';
import { RootState } from 'ui/src/types';
import { XhrApiResponse, XhrApiResponseError } from 'ui/src/types/XhrApi';
import { GeneralSettings } from '#types/GeneralSettings.ts';

const GeneralSettingsView: React.FC = () => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState<boolean>(true);
  const settings = useSelector((state: RootState) => state.generalSettings.settings);

  const [interval, setInterval] = useState<number>(settings?.interval ?? 60);
  const [port, setPort] = useState<number>(settings?.port ?? 9998);
  const [workingHourFrom, setWorkingHourFrom] = useState<number | string | null>(settings?.workingHours?.from ?? null);
  const [workingHourTo, setWorkingHourTo] = useState<number | string | null>(settings?.workingHours?.to ?? null);
  const [demoMode, setDemoMode] = useState<boolean>(settings?.demoMode ?? false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean | null>(settings?.analyticsEnabled ?? null);

  useEffect(() => {
    const init = async () => {
      await dispatch.generalSettings.getGeneralSettings();
      setLoading(false);
    };
    init();
  }, [dispatch]);

  const nullOrEmpty = (val: string | string[] | number | null) => val == null || String(val).length === 0;

  const throwMessage = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      Toast.error(message);
    } else {
      Toast.success(message);
    }
  };

  const onStore = async () => {
    if (nullOrEmpty(interval)) {
      throwMessage('Interval may not be empty.', 'error');
      return;
    }
    if (nullOrEmpty(port)) {
      throwMessage('Port may not be empty.', 'error');
      return;
    }
    if (
      (!nullOrEmpty(workingHourFrom) && nullOrEmpty(workingHourTo)) ||
      (nullOrEmpty(workingHourFrom) && !nullOrEmpty(workingHourTo))
    ) {
      throwMessage('Working hours to and from must be set if either to or from has been set before.', 'error');
      return;
    }
    xhrPost<GeneralSettings>('/api/admin/generalSettings', {
      interval,
      port,
      workingHours: {
        from: workingHourFrom?.toString() ?? null,
        to: workingHourTo?.toString() ?? null,
      },
      demoMode,
      analyticsEnabled,
    })
      .then(() => {
        throwMessage('Settings stored successfully. We will reload your browser in 3 seconds.', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      })
      .catch((exception: XhrApiResponseError | Error) => {
        throwMessage(parseError(exception), 'error');
      });
  };

  const handleWorkingHourFromChange = (value: Date | null) => {
    setWorkingHourFrom(value ? new Date(value).getTime() : null);
  };

  const handleWorkingHourToChange = (value: Date | null) => {
    setWorkingHourTo(value ? new Date(value).getTime() : null);
  };

  const handleIntervalChange = (value: number | string) => {
    setInterval(Number(value));
  };

  const handlePortChange = (value: number | string) => {
    setPort(Number(value));
  };

  const handleAnalyticsEnabledChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAnalyticsEnabled(e.target.checked);
  };

  const handleDemoModeChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDemoMode(e.target.checked);
  };

  return (
    <div>
      {!loading && (
        <React.Fragment>
          <Headline text="General Settings" />
          <div>
            <SegmentPart
              name="Interval"
              helpText="Interval in minutes for running queries against the configured services."
              Icon={IconRefresh}
            >
              <InputNumber
                min={0}
                max={1440}
                placeholder="Interval in minutes"
                value={interval}
                formatter={(value) => `${value}`.replace(/\D/g, '')}
                onChange={(value) => handleIntervalChange(value)}
                suffix="minutes"
              />
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart name="Port" helpText="Port on which Fredy is running." Icon={IconSignal}>
              <InputNumber
                min={0}
                max={99999}
                placeholder="Port"
                value={port}
                formatter={(value) => `${value}`.replace(/\D/g, '')}
                onChange={(value) => handlePortChange(value)}
              />
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart
              name="Working hours"
              helpText="During this hours, Fredy will search for new apartments. If nothing is configured, Fredy will search around the clock."
              Icon={IconCalendar}
            >
              <div className="generalSettings__timePickerContainer">
                <TimePicker
                  format="HH:mm"
                  insetLabel="From"
                  value={workingHourFrom ? new Date(workingHourFrom) : undefined}
                  placeholder=""
                  onChange={(value) => handleWorkingHourFromChange(value as Date)}
                />
                <TimePicker
                  format="HH:mm"
                  insetLabel="Until"
                  value={workingHourTo ? new Date(workingHourTo) : undefined}
                  placeholder=""
                  onChange={(value) => handleWorkingHourToChange(value as Date)}
                />
              </div>
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart name="Analytics" helpText="Insights into the usage of Fredy." Icon={IconLineChartStroked}>
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      lineHeight: '20px',
                    }}
                  >
                    Explanation
                  </div>
                }
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    Analytics are disabled by default. If you choose to enable them, we will begin tracking the
                    following:
                    <br />
                    <ul>
                      <li>Name of active provider (e.g. Immoscout)</li>
                      <li>Name of active adapter (e.g. Console)</li>
                      <li>language</li>
                      <li>os</li>
                      <li>node version</li>
                      <li>arch</li>
                    </ul>
                    The data is sent anonymously and helps me understand which providers or adapters are being used the
                    most. In the end it helps me to improve fredy.
                  </div>
                }
              />

              <Checkbox
                checked={analyticsEnabled === true}
                onChange={(e) => handleAnalyticsEnabledChange(e as ChangeEvent<HTMLInputElement>)}
              />
            </SegmentPart>
            <Divider margin="1rem" />
            <SegmentPart name="Demo Mode" helpText="If enabled, Fredy runs in demo mode." Icon={IconSearch}>
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      lineHeight: '20px',
                    }}
                  >
                    Explanation
                  </div>
                }
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    In demo mode, Fredy will not (really) search for any real estates. Fredy is in a lockdown mode. Also
                    all database files will be set back to the default values at midnight.
                  </div>
                }
              />

              <Checkbox checked={demoMode} onChange={(e) => handleDemoModeChange(e as ChangeEvent<HTMLInputElement>)} />
            </SegmentPart>
            <Divider margin="1rem" />
            <Button type="primary" theme="solid" onClick={onStore} icon={<IconSave />}>
              Save
            </Button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
};

export default GeneralSettingsView;
