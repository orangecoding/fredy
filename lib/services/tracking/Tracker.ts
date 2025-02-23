import Mixpanel from 'mixpanel';
import {getJobs} from '../storage/jobStorage.js';
import {getUniqueId} from './uniqueId.js';
import {config, inDevMode} from '../../utils.js';
import os from 'os';
import {readFileSync} from 'fs';
import {packageUp} from 'package-up';

const mixpanelTracker = Mixpanel.init('718670ef1c58c0208256c1e408a3d75e');
const distinct_id = getUniqueId() || 'N/A';
// @ts-expect-error TS(1378): Top-level 'await' expressions are only allowed whe... Remove this comment to see the full error message
const version = await getPackageVersion();

export const track = function () {
    //only send tracking information if the user allowed to do so.
    // @ts-expect-error TS(2339): Property 'analyticsEnabled' does not exist on type... Remove this comment to see the full error message
    if (config.analyticsEnabled && !inDevMode()) {
        const activeProvider = new Set();
        const activeAdapter = new Set();

        const jobs = getJobs();

        if (jobs != null && jobs.length > 0) {
            jobs.forEach((job: any) => {
                job.provider.forEach((provider: any) => {
                    activeProvider.add(provider.id);
                });
                job.notificationAdapter.forEach((adapter: any) => {
                    activeAdapter.add(adapter.id);
                });
            });

            mixpanelTracker.track(
                'fredy_tracking',
                enrichTrackingObject({
                    adapter: Array.from(activeAdapter),
                    provider: Array.from(activeProvider),
                }),
            );
        }
    }
};

/**
 * Note, this will only be used when Fredy runs in demo mode
 */
export function trackDemoJobCreated(jobData: any) {
    // @ts-expect-error TS(2339): Property 'analyticsEnabled' does not exist on type... Remove this comment to see the full error message
    if (config.analyticsEnabled && !inDevMode() && config.demoMode) {
        mixpanelTracker.track('demoJobCreated', enrichTrackingObject(jobData));
    }
}

/**
 * Note, this will only be used when Fredy runs in demo mode
 */
export function trackDemoAccessed() {
    // @ts-expect-error TS(2339): Property 'analyticsEnabled' does not exist on type... Remove this comment to see the full error message
    if (config.analyticsEnabled && !inDevMode() && config.demoMode) {
        mixpanelTracker.track('demoAccessed', enrichTrackingObject({}));
    }
}

function enrichTrackingObject(trackingObject: any) {
    const operating_system = os.platform();
    const os_version = os.release();
    const arch = process.arch;
    const language = process.env.LANG || 'en';
    const nodeVersion = process.version || 'N/A';

    return {
        ...trackingObject,
        // @ts-expect-error TS(2339): Property 'demoMode' does not exist on type '{}'.
        isDemo: config.demoMode,
        operating_system,
        os_version,
        arch,
        nodeVersion,
        language,
        distinct_id,
        fredy_version: version
    };
}

async function getPackageVersion() {
    try {
        const packagePath = await packageUp();
        // @ts-expect-error TS(2769): No overload matches this call.
        const packageJson = readFileSync(packagePath, 'utf8');
        const json = JSON.parse(packageJson);
        return json.version;
    } catch (error) {
        console.error('Error reading version from package.json', error);
    }
    return 'N/A';
}
