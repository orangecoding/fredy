import { removeJobsByUserId } from '../storage/jobStorage.js';
import { config } from '../../utils.js';
import { getUsers } from '../storage/userStorage.js';
import logger from '../logger.js';
import cron from 'node-cron';

/**
 * if we are running in demo environment, we have to cleanup the db files (specifically the jobs table)
 */
export function cleanupDemoAtMidnight() {
  cron.schedule('0 0 * * *', cleanup);
}

function cleanup() {
  if (config.demoMode) {
    const demoUser = getUsers(false).find((user) => user.username === 'demo');
    if (demoUser == null) {
      logger.error('Demo user not found, cannot remove Jobs');
      return;
    }
    removeJobsByUserId(demoUser.id);
  }
}
