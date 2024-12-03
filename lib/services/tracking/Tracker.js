import Mixpanel from 'mixpanel';
import { getJobs } from '../storage/jobStorage.js';
import { getUniqueId } from './uniqueId.js';
import { config, inDevMode } from '../../utils.js';

const mixpanelTracker = Mixpanel.init('718670ef1c58c0208256c1e408a3d75e');

const distinct_id = getUniqueId() || 'N/A';

export const track = function () {
  //only send tracking information if the user allowed to do so.
  if (config.analyticsEnabled && !inDevMode()) {
    const activeProvider = new Set();
    const activeAdapter = new Set();

    const jobs = getJobs();

    if (jobs != null && jobs.length > 0) {
      jobs.forEach((job) => {
        job.provider.forEach((provider) => {
          activeProvider.add(provider.id);
        });
        job.notificationAdapter.forEach((adapter) => {
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
export function trackDemoJobCreated(jobData) {
  if (config.analyticsEnabled && !inDevMode() && config.demoMode) {
    mixpanelTracker.track('demoJobCreated', enrichTrackingObject(jobData));
  }
}

/**
 * Note, this will only be used when Fredy runs in demo mode
 */
export function trackDemoAccessed() {
  if (config.analyticsEnabled && !inDevMode() && config.demoMode) {
    mixpanelTracker.track('demoAccessed', enrichTrackingObject({}));
  }
}

function enrichTrackingObject(trackingObject) {
  const platform = process.platform;
  const arch = process.arch;
  const language = process.env.LANG || 'en';
  const nodeVersion = process.version || 'N/A';

  return {
    ...trackingObject,
    isDemo: config.demoMode,
    platform,
    arch,
    nodeVersion,
    language,
    distinct_id,
  };
}
