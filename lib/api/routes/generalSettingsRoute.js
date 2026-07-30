/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { updateConfigOnDisk } from '../../utils.js';
import { ensureDemoUserExists } from '../../services/storage/userStorage.js';
import logger from '../../services/logger.js';
import { getSettings, getPublicSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';

/**
 * Settings a non-admin is served.
 *
 * The route stays open to every logged-in user because the app needs it during boot - `demoMode`
 * drives the demo banner and the navigation, `analyticsEnabled` gates the tracking consent modal,
 * and `interval` is shown on the dashboard. Everything else on this endpoint is operator
 * configuration (proxy credentials, database path, port, session lifetime) that a regular user has
 * no use for, so the payload is narrowed by role rather than the route being closed off.
 * @type {string[]}
 */
const NON_ADMIN_SETTINGS = ['demoMode', 'analyticsEnabled', 'interval'];

/**
 * Upper bound for the listing retention period, in days.
 *
 * A year of history is far beyond any plausible use, and an unbounded value would be indistinguishable
 * from "never delete" - which `0` already expresses.
 * @type {number}
 */
const MAX_LISTING_RETENTION_DAYS = 365;

/**
 * Validate the listing retention period.
 *
 * It drives an irreversible hard delete, so a fat-fingered value must be rejected here rather than
 * stored and acted on by the nightly purge.
 *
 * @param {any} value The raw value from the request body.
 * @returns {string|null} An error message, or null when the value is acceptable.
 */
function validateListingRetentionDays(value) {
  // Number('') and Number(null) are both 0, which would silently turn a cleared input field into
  // "never delete" instead of telling the operator their value did not arrive.
  if (value === '' || value === null) {
    return 'listingRetentionDays must be a number.';
  }
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0 || days > MAX_LISTING_RETENTION_DAYS) {
    return `listingRetentionDays must be an integer between 0 and ${MAX_LISTING_RETENTION_DAYS}.`;
  }
  return null;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function generalSettingsPlugin(fastify) {
  fastify.get('/', async (request) => {
    // getPublicSettings() drops secrets for everyone, admins included - nothing in the UI reads
    // them, and they must not travel to a browser.
    const settings = await getPublicSettings();
    if (isAdmin(request)) {
      return settings;
    }
    return Object.fromEntries(NON_ADMIN_SETTINGS.map((name) => [name, settings[name]]));
  });

  fastify.post('/', async (request, reply) => {
    const { sqlitepath, ...appSettings } = request.body || {};
    if (typeof appSettings.baseUrl === 'string') {
      appSettings.baseUrl = appSettings.baseUrl.trim().replace(/\/$/, '');
    }
    const localSettings = await getSettings();

    if (!isAdmin(request)) {
      const reason = localSettings.demoMode
        ? 'In demo mode, it is not allowed to change these settings.'
        : 'Only admins can change these settings.';
      return reply.code(403).send({ error: reason });
    }

    if (typeof appSettings.listingRetentionDays !== 'undefined') {
      const error = validateListingRetentionDays(appSettings.listingRetentionDays);
      if (error != null) {
        return reply.code(400).send({ error });
      }
      appSettings.listingRetentionDays = Number(appSettings.listingRetentionDays);
    }

    try {
      if (typeof sqlitepath !== 'undefined') {
        updateConfigOnDisk({ sqlitepath });
      }

      upsertSettings(appSettings);
      await ensureDemoUserExists();
      if (appSettings.baseUrl != null) {
        await trackPoi(TRACKING_POIS.BASE_URL_SETTING);
      }
      if (appSettings.proxyUrl != null) {
        await trackPoi(TRACKING_POIS.SET_PROXY_SETTING);
      }
    } catch (err) {
      logger.error(err);
      return reply.code(500).send({ error: 'Error while trying to write settings.' });
    }
    return reply.send();
  });
}
