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
const isDocker = process.env.IS_DOCKER != null;

const staticTrackingData = {
  operatingSystem: os.platform(),
  osVersion: os.release(),
  isDocker,
  arch: process.arch,
  language: process.env.LANG || 'en',
  nodeVersion: process.version || 'N/A',
  deviceId,
  version,
};

const shouldTrack = async () => {
  const settings = await getSettings();
  return settings.analyticsEnabled && !inDevMode();
};

const sendTrackingData = async (endpoint, payload) => {
  try {
    const response = await fetch(`${FREDY_TRACKING_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) {
      logger.warn(`Error sending tracking data to ${endpoint}. Status: ${response.status}`);
    }
  } catch (error) {
    logger.warn(`Error sending tracking data to ${endpoint}`, error);
  }
};

export const trackMainEvent = async () => {
  if (!(await shouldTrack())) return;

  const activeProvider = new Set();
  const activeAdapter = new Set();

  const jobs = getJobs();

  if (jobs != null && jobs.length > 0) {
    jobs.forEach((job) => {
      job.provider.forEach((provider) => activeProvider.add(provider.id));
      job.notificationAdapter.forEach((adapter) => activeAdapter.add(adapter.id));
    });

    const trackingObj = await enrichTrackingObject({
      adapter: Array.from(activeAdapter),
      provider: Array.from(activeProvider),
    });

    await sendTrackingData('/main', trackingObj);
  }
};

export const trackPoi = async (poi) => {
  if (!(await shouldTrack())) return;

  const trackingObj = await enrichTrackingObject({
    feature: poi,
  });

  await sendTrackingData('/feature', trackingObj);
};

/**
 * Note, this will only be used when Fredy runs in demo mode
 */
export async function trackDemoAccessed() {
  const settings = await getSettings();
  if (settings.analyticsEnabled && !inDevMode() && settings.demoMode) {
    const trackingObj = await enrichTrackingObject({});
    await sendTrackingData('/demo/accessed', trackingObj);
  }
}

async function enrichTrackingObject(trackingObject) {
  const settings = await getSettings();

  return {
    ...trackingObject,
    ...staticTrackingData,
    isDemo: settings.demoMode,
  };
}
