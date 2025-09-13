import { getJobs } from '../storage/jobStorage.js';
import { getUniqueId } from './uniqueId.js';
import { config, inDevMode } from '../../utils.js';
import os from 'os';
import { readFileSync } from 'fs';
import { packageUp } from 'package-up';
import fetch from 'node-fetch';

const deviceId = getUniqueId() || 'N/A';
const version = await getPackageVersion();
const FREDY_TRACKING_URL = 'https://fredy.orange-coding.net/tracking';

export const trackMainEvent = async () => {
  try {
    if (config.analyticsEnabled && !inDevMode()) {
      const activeProvider = new Set();
      const activeAdapter = new Set();

      const jobs = getJobs();

      if (jobs != null && jobs.length > 0) {
        jobs.forEach((job) => {
          job.provider.forEach((provider) => activeProvider.add(provider.id));
          job.notificationAdapter.forEach((adapter) => activeAdapter.add(adapter.id));
        });

        const trackingObj = enrichTrackingObject({
          adapter: Array.from(activeAdapter),
          provider: Array.from(activeProvider),
        });

        await fetch(`${FREDY_TRACKING_URL}/main`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trackingObj),
        });
      }
    }
  } catch (error) {
    console.warn('Error sending tracking data', error);
  }
};

/**
 * Note, this will only be used when Fredy runs in demo mode
 */
export async function trackDemoAccessed() {
  if (config.analyticsEnabled && !inDevMode() && config.demoMode) {
    try {
      await fetch(`${FREDY_TRACKING_URL}/demo/accessed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.warn('Error sending tracking data', error);
    }
  }
}

function enrichTrackingObject(trackingObject) {
  const operatingSystem = os.platform();
  const osVersion = os.release();
  const arch = process.arch;
  const language = process.env.LANG || 'en';
  const nodeVersion = process.version || 'N/A';

  return {
    ...trackingObject,
    isDemo: config.demoMode,
    operatingSystem,
    osVersion,
    arch,
    nodeVersion,
    language,
    deviceId,
    version,
  };
}

async function getPackageVersion() {
  try {
    const packagePath = await packageUp();
    const packageJson = readFileSync(packagePath, 'utf8');
    const json = JSON.parse(packageJson);
    return json.version;
  } catch (error) {
    console.error('Error reading version from package.json', error);
  }
  return 'N/A';
}
