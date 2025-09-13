import cron from 'node-cron';
import { config, inDevMode } from '../../utils.js';
import { trackMainEvent } from './Tracker.js';

async function runTask() {
  //make sure to only send tracking events if the user gave us the green light and we are not in dev mode
  if (config.analyticsEnabled && !inDevMode()) {
    await trackMainEvent();
  }
}

export async function initTrackerCron() {
  //run directly on start
  await runTask();
  // then every 6 hours
  cron.schedule('0 */6 * * *', runTask);
}
