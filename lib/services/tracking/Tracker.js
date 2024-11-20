import Mixpanel from 'mixpanel';
import {getJobs} from '../storage/jobStorage.js';

import {config} from '../../utils.js';

export const track = function () {
    //only send tracking information if the user allowed to do so.
    if (config.analyticsEnabled) {

        const mixpanelTracker = Mixpanel.init('718670ef1c58c0208256c1e408a3d75e');

        const activeProvider = new Set();
        const activeAdapter = new Set();
        const platform = process.platform;
        const arch = process.arch;
        const language = process.env.LANG || 'en';
        const nodeVersion = process.version || 'N/A';

        const jobs = getJobs();

        if (jobs != null && jobs.length > 0) {
            jobs.forEach(job => {
                job.provider.forEach(provider => {
                    activeProvider.add(provider.id);
                });
                job.notificationAdapter.forEach(adapter => {
                    activeAdapter.add(adapter.id);
                });
            });

            mixpanelTracker.track('fredy_tracking', {
                adapter: Array.from(activeAdapter),
                provider: Array.from(activeProvider),
                isDemo: config.demoMode,
                platform,
                arch,
                nodeVersion,
                language
            });
        }
    }
};