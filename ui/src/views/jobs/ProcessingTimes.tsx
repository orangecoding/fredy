// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import {format} from '../../services/time/timeService';
import {Banner, Descriptions} from '@douyinfe/semi-ui';

export default function ProcessingTimes({processingTimes = {}}) {
    if (Object.keys(processingTimes).length === 0) {
        return null;
    }
    return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <>
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Descriptions
                row
                size="small"
                style={{
                    backgroundColor: '#35363c',
                    borderRadius: '4px',
                    padding: '10px',
                }}
            >
                // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                <Descriptions.Item itemKey="Processing Interval">{processingTimes.interval} min</Descriptions.Item>
                // @ts-expect-error TS(2339): Property 'lastRun' does not exist on type '{}'.
                {processingTimes.lastRun && (
                    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                    <>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Descriptions.Item itemKey="Last run">{format(processingTimes.lastRun)}</Descriptions.Item>
                        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
                        <Descriptions.Item itemKey="Next run">
                            // @ts-expect-error TS(2339): Property 'lastRun' does not exist on type '{}'.
                            {format(processingTimes.lastRun + processingTimes.interval * 60000)}
                        </Descriptions.Item>
                    </>
                )}
            </Descriptions>
        </>
    );
}
