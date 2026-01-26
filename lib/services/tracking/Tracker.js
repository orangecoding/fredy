/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getJobs } from '../storage/jobStorage.js';
import { getUniqueId } from './uniqueId.js';
import { getPackageVersion, inDevMode } from '../../utils.js';
import os from 'os';
import fetch from 'node-fetch';
import logger from '../logger.js';
import { getSettings } from '../storage/settingsStorage.js';

const deviceId = getUniqueId() || 'N/A';
const version = await getPackageVersion();
const FREDY_TRACKING_URL = 'https://fredy.orange-coding.net/tracking';

export const trackMainEvent = async () => {
  try {
    const settings = await getSettings();
    if (settings.analyticsEnabled && !inDevMode()) {
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
    logger.warn('Error sending tracking data', error);
  }
};

export const trackFeature = async (feature) => {
  try {
    const settings = await getSettings();
    if (settings.analyticsEnabled && !inDevMode()) {
      const trackingObj = await enrichTrackingObject({
        feature,
      });

      await fetch(`${FREDY_TRACKING_URL}/feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackingObj),
      });
    }
  } catch (error) {
    logger.warn('Error tracking feature', error);
  }
};

/**
 * Note, this will only be used when Fredy runs in demo mode
 */
export async function trackDemoAccessed() {
  const settings = await getSettings();
  if (settings.analyticsEnabled && !inDevMode() && settings.demoMode) {
    try {
      await fetch(`${FREDY_TRACKING_URL}/demo/accessed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.warn('Error sending tracking data', error);
    }
  }
}

async function enrichTrackingObject(trackingObject) {
  const settings = await getSettings();
  const operatingSystem = os.platform();
  const osVersion = os.release();
  const arch = process.arch;
  const language = process.env.LANG || 'en';
  const nodeVersion = process.version || 'N/A';

  return {
    ...trackingObject,
    isDemo: settings.demoMode,
    operatingSystem,
    osVersion,
    arch,
    nodeVersion,
    language,
    deviceId,
    version,
  };
}
