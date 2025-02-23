// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

import {useDispatch, useSelector} from 'react-redux';

import {Divider, TimePicker, Button, Checkbox} from '@douyinfe/semi-ui';
import {InputNumber} from '@douyinfe/semi-ui';
// @ts-expect-error TS(6142): Module '../../components/headline/Headline' was re... Remove this comment to see the full error message
import Headline from '../../components/headline/Headline';
import {xhrPost} from '../../services/xhr';
// @ts-expect-error TS(6142): Module '../../components/segment/SegmentPart' was ... Remove this comment to see the full error message
import {SegmentPart} from '../../components/segment/SegmentPart';
import {Banner, Toast} from '@douyinfe/semi-ui';
import {IconSave, IconCalendar, IconRefresh, IconSignal, IconLineChartStroked, IconSearch} from '@douyinfe/semi-icons';
import './GeneralSettings.less';

function formatFromTimestamp(ts: any) {
    const date = new Date(ts);
    return `${date.getHours()}:${date.getMinutes() > 9 ? date.getMinutes() : '0' + date.getMinutes()}`;
}

function formatFromTBackend(time: any) {
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

    // @ts-expect-error TS(2571): Object is of type 'unknown'.
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

    const nullOrEmpty = (val: any) => val == null || val.length === 0;

    const throwMessage = (message: any, type: any) => {
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
                analyticsEnabled
            });
        } catch (exception) {
            console.error(exception);
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            if(exception?.json?.message != null){
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                throwMessage(exception.json.message, 'error');
            }else {
                throwMessage('Error while trying to store settings.', 'error');
            }
            return;
        }
        throwMessage('Settings stored successfully. We will reload your browser in 3 seconds.', 'success');
        setTimeout(()=>{
            location.reload();
        }, 3000);
    };

    return (
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <div>
            {!loading && (
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <React.Fragment>
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <Headline text="General Settings"/>
                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                    <div>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <SegmentPart
                            name="Interval"
                            helpText="Interval in minutes for running queries against the configured services."
                            Icon={IconRefresh}
                        >
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <InputNumber
                                min={0}
                                max={1440}
                                placeholder="Interval in minutes"
                                value={interval}
                                formatter={(value: any) => `${value}`.replace(/\D/g, '')}
                                onChange={(value: any) => setInterval(value)}
                                suffix={'minutes'}
                            />
                        </SegmentPart>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Divider margin="1rem"/>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <SegmentPart name="Port" helpText="Port on which Fredy is running." Icon={IconSignal}>
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <InputNumber
                                min={0}
                                max={99999}
                                placeholder="Port"
                                value={port}
                                formatter={(value: any) => `${value}`.replace(/\D/g, '')}
                                onChange={(value: any) => setPort(value)}
                            />
                        </SegmentPart>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Divider margin="1rem"/>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <SegmentPart
                            name="Working hours"
                            helpText="During this hours, Fredy will search for new apartments. If nothing is configured, Fredy will search around the clock."
                            Icon={IconCalendar}
                        >
                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                            <div className="generalSettings__timePickerContainer">
                                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                                <TimePicker
                                    format={'HH:mm'}
                                    insetLabel="From"
                                    value={formatFromTBackend(workingHourFrom)}
                                    placeholder=""
                                    onChange={(val: any) => {
                                        setWorkingHourFrom(val == null ? null : formatFromTimestamp(val));
                                    }}
                                />
                                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                                <TimePicker
                                    format={'HH:mm'}
                                    insetLabel="Until"
                                    value={formatFromTBackend(workingHourTo)}
                                    placeholder=""
                                    onChange={(val: any) => {
                                        setWorkingHourTo(val == null ? null : formatFromTimestamp(val));
                                    }}
                                />
                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                            </div>
                        </SegmentPart>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Divider margin="1rem"/>

                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <SegmentPart
                            name="Analytics"
                            helpText="Insights into the usage of Fredy."
                            Icon={IconLineChartStroked}
                        >
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <Banner
                                fullMode={false}
                                type="info"
                                closeIcon={null}
                                title={
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    <div style={{fontWeight: 600, fontSize: '14px', lineHeight: '20px'}}>
                                        Explanation
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    </div>
                                }
                                style={{marginBottom: '1rem'}}
                                description={
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    <div>
                                        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                        Analytics are disabled by default. If you choose to enable them, we will begin tracking the following:<br/>
                                        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                        <ul>
                                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                            <li>Name of active provider (e.g. Immoscout)</li>
                                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                            <li>Name of active adapter (e.g. Console)</li>
                                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                            <li>language</li>
                                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                            <li>os</li>
                                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                            <li>node version</li>
                                            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                            <li>arch</li>
                                        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                        </ul>
                                        The data is sent anonymously and helps me understand which providers or adapters are being used the most. In the end it helps me to improve fredy.
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    </div>
                                }
                            />

                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <Checkbox
                                checked={analyticsEnabled}
                                onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                            > Enabled
                            </Checkbox>

                        </SegmentPart>

                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Divider margin="1rem"/>

                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <SegmentPart
                            name="Demo Mode"
                            helpText="If enabled, Fredy runs in demo mode."
                            Icon={IconSearch}
                        >
                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <Banner
                                fullMode={false}
                                type="info"
                                closeIcon={null}
                                title={
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    <div style={{fontWeight: 600, fontSize: '14px', lineHeight: '20px'}}>
                                        Explanation
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    </div>
                                }
                                style={{marginBottom: '1rem'}}
                                description={
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    <div>
                                        In demo mode, Fredy will not (really) search for any real estates. Fredy is in a lockdown mode. Also
                                        all database files will be set back to the default values at midnight.
                                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                                    </div>
                                }
                            />

                            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                            <Checkbox
                                checked={demoMode}
                                onChange={(e) => setDemoMode(e.target.checked)}
                            > Enabled
                            </Checkbox>

                        </SegmentPart>

                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Divider margin="1rem"/>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Button type="primary" theme="solid" onClick={onStore} icon={<IconSave/>}>
                            Save
                        </Button>
                    // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
                    </div>
                </React.Fragment>
            )}
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        </div>
    );
};

export default GeneralSettings;
