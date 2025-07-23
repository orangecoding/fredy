import React from 'react';

import { useDispatch, useSelector } from 'react-redux';

import { Divider, TimePicker, Button, Checkbox } from '@douyinfe/semi-ui';
import { InputNumber } from '@douyinfe/semi-ui';
import Headline from '../../components/headline/Headline';
import { xhrPost } from '../../services/xhr';
import { SegmentPart } from '../../components/segment/SegmentPart';
import { Banner, Toast } from '@douyinfe/semi-ui';
import {
  IconSave,
  IconCalendar,
  IconRefresh,
  IconSignal,
  IconLineChartStroked,
  IconSearch,
} from '@douyinfe/semi-icons';
import './GeneralSettings.less';

function formatFromTimestamp(ts) {
  const date = new Date(ts);
  return `${date.getHours()}:${date.getMinutes() > 9 ? date.getMinutes() : '0' + date.getMinutes()}`;
}

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

const GeneralSettings = function GeneralSettings() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);

  const settings = useSelector((state) => state.generalSettings.settings);

  const [interval, setInterval] = React.useState('');
  const [port, setPort] = React.useState('');
  const [workingHourFrom, setWorkingHourFrom] = React.useState(null);
  const [workingHourTo, setWorkingHourTo] = React.useState(null);
  const [demoMode, setDemoMode] = React.useState(null);
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(null);

  React.useEffect(() => {
    async function init() {
      await dispatch.generalSettings.getGeneralSettings();
      setLoading(false);
    }

    init();
  }, []);

  React.useEffect(() => {
    async function init() {
      setInterval(settings?.interval);
      setPort(settings?.port);
      setWorkingHourFrom(settings?.workingHours?.from);
      setWorkingHourTo(settings?.workingHours?.to);
      setAnalyticsEnabled(settings?.analyticsEnabled || false);
      setDemoMode(settings?.demoMode || false);
    }

    init();
  }, [settings]);

  const nullOrEmpty = (val) => val == null || val.length === 0;

  const throwMessage = (message, type) => {
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
    try {
      await xhrPost('/api/admin/generalSettings', {
        interval,
        port,
        workingHours: {
          from: workingHourFrom,
          to: workingHourTo,
        },
        demoMode,
        analyticsEnabled,
      });
    } catch (exception) {
      console.error(exception);
      if (exception?.json?.message != null) {
        throwMessage(exception.json.message, 'error');
      } else {
        throwMessage('Error while trying to store settings.', 'error');
      }
      return;
    }
    throwMessage('Settings stored successfully. We will reload your browser in 3 seconds.', 'success');
    setTimeout(() => {
      location.reload();
    }, 3000);
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
                onChange={(value) => setInterval(value)}
                suffix={'minutes'}
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
                onChange={(value) => setPort(value)}
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
                  format={'HH:mm'}
                  insetLabel="From"
                  value={formatFromTBackend(workingHourFrom)}
                  placeholder=""
                  onChange={(val) => {
                    setWorkingHourFrom(val == null ? null : formatFromTimestamp(val));
                  }}
                />
                <TimePicker
                  format={'HH:mm'}
                  insetLabel="Until"
                  value={formatFromTBackend(workingHourTo)}
                  placeholder=""
                  onChange={(val) => {
                    setWorkingHourTo(val == null ? null : formatFromTimestamp(val));
                  }}
                />
              </div>
            </SegmentPart>
            <Divider margin="1rem" />

            <SegmentPart name="Analytics" helpText="Insights into the usage of Fredy." Icon={IconLineChartStroked}>
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Explanation</div>}
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

              <Checkbox checked={analyticsEnabled} onChange={(e) => setAnalyticsEnabled(e.target.checked)}>
                {' '}
                Enabled
              </Checkbox>
            </SegmentPart>

            <Divider margin="1rem" />

            <SegmentPart name="Demo Mode" helpText="If enabled, Fredy runs in demo mode." Icon={IconSearch}>
              <Banner
                fullMode={false}
                type="info"
                closeIcon={null}
                title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Explanation</div>}
                style={{ marginBottom: '1rem' }}
                description={
                  <div>
                    In demo mode, Fredy will not (really) search for any real estates. Fredy is in a lockdown mode. Also
                    all database files will be set back to the default values at midnight.
                  </div>
                }
              />

              <Checkbox checked={demoMode} onChange={(e) => setDemoMode(e.target.checked)}>
                {' '}
                Enabled
              </Checkbox>
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

export default GeneralSettings;
