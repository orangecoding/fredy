/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getJobs } from '../storage/jobStorage.js';
import { getListingsKpisForJobIds } from '../storage/listingsStorage.js';
import { normalizeDealType } from '../dealType.js';
import { resolveJobPriceRange } from './priceRange.js';
import { getUniqueId } from './uniqueId.js';
import { getPackageVersion, getProviders, inDevMode } from '../../utils.js';
import os from 'os';
import fetch from 'node-fetch';
import logger from '../logger.js';
import { getSettings } from '../storage/settingsStorage.js';

/** @import { Job } from '../../types/job.js' */

const deviceId = getUniqueId() || 'N/A';
const version = await getPackageVersion();
const FREDY_TRACKING_URL = 'https://fredy.orange-coding.net/tracking';
const TRACKING_CATEGORY = 'fredy';
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

/**
 * Post one tracking payload. Never throws and never makes the caller wait on anything but the
 * request itself.
 *
 * @param {string} endpoint Path below {@link FREDY_TRACKING_URL}, e.g. `/main`.
 * @param {Object} [payload]
 * @returns {Promise<import('node-fetch').Response|null>} The response, or `null` when the request
 *   never completed. Most callers ignore it; the price observation reads the body to tell an
 *   accepted-and-stored answer from an accepted-and-dropped one.
 */
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
    return response;
  } catch (error) {
    logger.warn(`Error sending tracking data to ${endpoint}`, error);
    return null;
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

    // Rides along with the main event rather than with each job run. What a square metre costs is a
    // property of the search, not of a single crawl, so reporting it per run said the same thing
    // several times an hour on a busy instance and nothing at all on a quiet one.
    await reportPriceObservations(jobs);
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
 * Report what a square metre cost in one job's search.
 *
 * One observation per job, not per listing and not per crawl: what a square metre costs is a
 * property of the search, and the receiving side builds a picture of the German market out of one
 * such observation per job per device.
 *
 * The number sent is the median over *this job's own* listings, which is to say over the listings
 * the user's price filter let through. It has to be: the observation is sorted into a price band by
 * that filter, so a figure that did not depend on it would read the same in every band. That rules
 * out the market median stored next to each listing - that one measures the neighbourhood around
 * it, which barely moves between bands.
 *
 * Never throws and never rejects, like every other tracking call.
 *
 * @param {Job} job
 * @param {any[]} providers The loaded provider modules, needed to read the price range out of the
 *   job's search URLs - see {@link resolveJobPriceRange}.
 * @returns {Promise<void>}
 */
export const trackJobPriceObservation = async (job, providers = []) => {
  try {
    if (job?.id == null || !(await shouldTrack())) return;

    const jobType = normalizeDealType(job.dealType);
    // A rental at 12 EUR/m² and a purchase at 4.800 EUR/m² are three orders of magnitude apart, so
    // an undecided job has nothing to report. The median below is null for such a job anyway - it
    // is computed per deal type - which makes this the earlier of two exits, not the only one.
    if (jobType == null) return;

    const { medianPriceOfListings, medianPricePerSqm } = getListingsKpisForJobIds([job.id]);
    // Nothing measurable yet: no listing of this job carries a price per square metre.
    if (medianPricePerSqm == null) return;

    const { min, max } = resolveJobPriceRange(job, providers);
    const payload = {
      category: TRACKING_CATEGORY,
      device_id: deviceId,
      job_type: jobType,
      median_price: medianPricePerSqm.value,
      // The median *total* price, only ever used on the other side to check a guessed price band
      // against the total prices its borders are made of. Left out rather than sent as a bogus 0
      // when the job has no priced listing at all: the observation is still stored, just flagged as
      // one whose band was guessed.
      ...(Number.isFinite(medianPriceOfListings) && medianPriceOfListings > 0
        ? { median_price_total: medianPriceOfListings }
        : {}),
      price_min: min,
      price_max: max,
      sample_size: medianPricePerSqm.sampleSize,
    };

    const response = await sendTrackingData('/price', payload);
    if (response?.ok) {
      const result = await response.json().catch(() => null);
      if (result?.stored === false) {
        // Accepted but dropped, and never worth a retry: this device already reported this
        // combination in the current month, the guessed band did not match the reported total
        // price, or the location could not be resolved.
        logger.debug(`Price observation for job ${job.id} was accepted but not stored`);
      }
    }
  } catch (error) {
    logger.warn(`Error reporting the price observation for job ${job?.id}`, error);
  }
};

/**
 * One price observation per job, sent one after another rather than all at once: this is a
 * background report on a schedule, and there is nothing waiting on it that a burst would serve.
 *
 * The provider modules are loaded once for the whole batch. `getProviders()` caches them anyway,
 * but asking here keeps that an implementation detail of the loader rather than an assumption.
 * A loader that cannot answer costs the price ranges read out of the search URLs, and the job's own
 * spec filter answers instead - it must not cost the main event, which has already been sent.
 *
 * @param {Job[]} jobs
 * @returns {Promise<void>}
 */
const reportPriceObservations = async (jobs) => {
  const providers = await getProviders().catch(() => []);
  for (const job of jobs) {
    await trackJobPriceObservation(job, providers);
  }
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
    category: TRACKING_CATEGORY,
    ...trackingObject,
    ...staticTrackingData,
    isDemo: settings.demoMode,
  };
}
