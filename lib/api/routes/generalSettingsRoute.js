/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { updateConfigOnDisk, isValidTimeZone } from '../../utils.js';
import { ensureDemoUserExists } from '../../services/storage/userStorage.js';
import logger from '../../services/logger.js';
import { getSettings, getPublicSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import { prepareProxyAuthSettings, PROXY_AUTH_SETTINGS } from '../proxyAuth.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import { normalizeSourceSwitches } from '../../services/connectivity/connectivityService.js';
import { SOURCE_IDS } from '../../services/connectivity/sources.js';

/**
 * Settings a non-admin is served.
 *
 * The route stays open to every logged-in user because the app needs it during boot - `demoMode`
 * drives the demo banner and the navigation, `analyticsEnabled` gates the tracking consent modal,
 * and `interval` is shown on the dashboard. Everything else on this endpoint is operator
 * configuration (proxy credentials, database path, port, session lifetime) that a regular user has
 * no use for, so the payload is narrowed by role rather than the route being closed off.
 *
 * `connectivityEnabled` is here for the same reason `demoMode` is: it decides whether a whole
 * section of the listings UI exists. Without it every user would be shown broadband filters that
 * their operator has switched off, and they would silently match nothing.
 * @type {string[]}
 */
const NON_ADMIN_SETTINGS = ['demoMode', 'analyticsEnabled', 'interval', 'connectivityEnabled'];

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
 * Bounds for the price tracking settings.
 *
 * Unlike the retention period these do not delete anything, but they do decide how much traffic
 * Fredy sends at the portals: every tracked listing costs one rendered browser page. A daily
 * re-check of thousands of listings is the shape of request pattern that gets an instance blocked,
 * so the ceilings exist to keep a mistyped value from turning into that.
 * @type {Record<string, {min: number, max: number, integer: boolean}>}
 */
const PRICE_SETTING_BOUNDS = {
  priceCheckIntervalDays: { min: 1, max: 30, integer: true },
  priceCheckLimitPerRun: { min: 1, max: 500, integer: true },
  priceChangeThresholdPercent: { min: 0, max: 50, integer: false },
};

/**
 * Validate one numeric price tracking setting.
 *
 * An empty or null value is rejected rather than coerced: `Number('')` is 0, which for the
 * threshold silently means "notify me about every rounding artefact" and for the others is out of
 * range anyway. Better to tell the operator their value did not arrive.
 *
 * @param {string} name The setting name, used in the message.
 * @param {any} value The raw value from the request body.
 * @returns {string|null} An error message, or null when the value is acceptable.
 */
function validatePriceSetting(name, value) {
  const bounds = PRICE_SETTING_BOUNDS[name];
  if (value === '' || value === null) {
    return `${name} must be a number.`;
  }
  const parsed = Number(value);
  const wellFormed = bounds.integer ? Number.isInteger(parsed) : Number.isFinite(parsed);
  if (!wellFormed || parsed < bounds.min || parsed > bounds.max) {
    return `${name} must be ${bounds.integer ? 'an integer' : 'a number'} between ${bounds.min} and ${bounds.max}.`;
  }
  return null;
}

/**
 * Bounds for the connectivity sweep settings.
 *
 * The registers behind the feature are public services, so the ceiling on the batch size is there
 * to keep a mistyped value from turning a nightly sweep into a burst somebody has to block. The
 * age is bounded at the bottom because the data underneath only moves twice a year - re-asking
 * daily would be pure traffic for an answer that cannot have changed.
 * @type {Record<string, {min: number, max: number, integer: boolean}>}
 */
const CONNECTIVITY_SETTING_BOUNDS = {
  connectivityLimitPerRun: { min: 1, max: 1000, integer: true },
  connectivityMaxAgeDays: { min: 7, max: 730, integer: true },
};

/**
 * Validate one numeric connectivity setting.
 *
 * @param {string} name The setting name, used in the message.
 * @param {any} value The raw value from the request body.
 * @returns {string|null} An error message, or null when the value is acceptable.
 */
function validateConnectivitySetting(name, value) {
  const bounds = CONNECTIVITY_SETTING_BOUNDS[name];
  if (value === '' || value === null) {
    return `${name} must be a number.`;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    return `${name} must be an integer between ${bounds.min} and ${bounds.max}.`;
  }
  return null;
}

/**
 * Bounds for the routing settings: how travel times and nearby places are worked out.
 *
 * Every one of these decides how much traffic Fredy sends at services run by volunteers, which is
 * why they are bounded rather than free. The reachability ceiling is the sharpest of them: a big
 * city answers for about nine megabytes at ninety minutes and about two at thirty, so it is the
 * size dial on the single most expensive request Fredy makes.
 * @type {Record<string, {min: number, max: number}>}
 */
const ROUTING_SETTING_BOUNDS = {
  travelTimeLimitPerRun: { min: 1, max: 5000 },
  travelTimeMaxAgeDays: { min: 1, max: 365 },
  travelTimeMaxMinutes: { min: 15, max: 180 },
  // Zero is meaningful here and nowhere else in this table: it turns street routing off entirely,
  // which is a legitimate choice for an operator who wants to be as light as possible.
  travelTimeStreetLookupsPerRun: { min: 0, max: 500 },
  poiLookupsPerRun: { min: 0, max: 500 },
  poiCacheMaxAgeDays: { min: 1, max: 365 },
};

/**
 * Validate one numeric routing setting.
 *
 * @param {string} name The setting name, used in the message.
 * @param {any} value The raw value from the request body.
 * @returns {string|null} An error message, or null when the value is acceptable.
 */
function validateRoutingSetting(name, value) {
  const bounds = ROUTING_SETTING_BOUNDS[name];
  if (value === '' || value === null) {
    return `${name} must be a number.`;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    return `${name} must be an integer between ${bounds.min} and ${bounds.max}.`;
  }
  return null;
}

/**
 * Validate an endpoint an operator can point Fredy at.
 *
 * Both of these exist because the default is a free community service that may withdraw its
 * welcome, so an operator has to be able to move without a code change. An empty value is allowed
 * and means "use the built-in default", which is how somebody undoes a change they regret.
 *
 * `http` is permitted deliberately: the realistic reason to set either of these is a MOTIS or
 * Overpass instance on the operator's own network, which usually has no certificate.
 *
 * @param {string} name The setting name, used in the message.
 * @param {any} value The raw value from the request body.
 * @returns {string|null} An error message, or null when the value is acceptable.
 */
function validateEndpointSetting(name, value) {
  if (value == null || String(value).trim().length === 0) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    return `${name} must be a valid URL.`;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? null : `${name} must be an http or https URL.`;
}

/**
 * Validate the working-hours window.
 *
 * The two edges are checked because the scheduler treats an unparseable time as "no window at all"
 * and runs anyway - an operator who mistypes an edge would otherwise get jobs around the clock with
 * nothing telling them why. The zone is checked because it decides what the two edges mean; an
 * unknown one would silently fall back to the process zone, which is the drift this setting exists
 * to remove.
 *
 * @param {any} value The raw value from the request body.
 * @returns {string|null} An error message, or null when the value is acceptable.
 */
function validateWorkingHours(value) {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return 'workingHours must be an object.';
  }
  const isSet = (edge) => edge != null && String(edge).length > 0;
  const wellFormed = (edge) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(edge));

  for (const edge of ['from', 'to']) {
    if (isSet(value[edge]) && !wellFormed(value[edge])) {
      return `workingHours.${edge} must be a time in HH:mm format.`;
    }
  }
  if (isSet(value.from) !== isSet(value.to)) {
    return 'workingHours needs both a start and an end, or neither.';
  }
  if (isSet(value.timeZone) && !isValidTimeZone(value.timeZone)) {
    return 'workingHours.timeZone must be a valid IANA time zone, for example Europe/Berlin.';
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

    if (typeof appSettings.workingHours !== 'undefined') {
      const error = validateWorkingHours(appSettings.workingHours);
      if (error != null) {
        return reply.code(400).send({ error });
      }
    }

    for (const name of Object.keys(PRICE_SETTING_BOUNDS)) {
      if (typeof appSettings[name] === 'undefined') continue;
      const error = validatePriceSetting(name, appSettings[name]);
      if (error != null) {
        return reply.code(400).send({ error });
      }
      appSettings[name] = Number(appSettings[name]);
    }

    if (PROXY_AUTH_SETTINGS.some((name) => typeof appSettings[name] !== 'undefined')) {
      const error = prepareProxyAuthSettings(appSettings, localSettings);
      if (error != null) {
        return reply.code(400).send({ error });
      }
    }

    if (typeof appSettings.priceTrackingEnabled !== 'undefined') {
      appSettings.priceTrackingEnabled = appSettings.priceTrackingEnabled === true;
    }

    for (const name of Object.keys(CONNECTIVITY_SETTING_BOUNDS)) {
      if (typeof appSettings[name] === 'undefined') continue;
      const error = validateConnectivitySetting(name, appSettings[name]);
      if (error != null) {
        return reply.code(400).send({ error });
      }
      appSettings[name] = Number(appSettings[name]);
    }

    if (typeof appSettings.connectivityEnabled !== 'undefined') {
      appSettings.connectivityEnabled = appSettings.connectivityEnabled === true;
    }

    for (const name of Object.keys(ROUTING_SETTING_BOUNDS)) {
      if (typeof appSettings[name] === 'undefined') continue;
      const error = validateRoutingSetting(name, appSettings[name]);
      if (error != null) {
        return reply.code(400).send({ error });
      }
      appSettings[name] = Number(appSettings[name]);
    }

    for (const name of ['motisBaseUrl', 'overpassBaseUrl']) {
      if (typeof appSettings[name] === 'undefined') continue;
      const error = validateEndpointSetting(name, appSettings[name]);
      if (error != null) {
        return reply.code(400).send({ error });
      }
      // Trimmed here so the clients can compare and fall back on emptiness alone.
      appSettings[name] = String(appSettings[name]).trim();
    }

    if (typeof appSettings.poiEnabled !== 'undefined') {
      appSettings.poiEnabled = appSettings.poiEnabled === true;
    }

    // Normalised rather than validated: the switches are a map keyed by source id, and a request
    // carrying an id no source claims should lose that key rather than be rejected - an instance
    // downgrading to a release with fewer sources would otherwise be unable to save this page.
    if (typeof appSettings.connectivitySources !== 'undefined') {
      appSettings.connectivitySources = normalizeSourceSwitches(appSettings.connectivitySources);
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
      // Compared against what was stored rather than fired on arrival: this page posts all of its
      // fields on every save, so "the value is present" says nothing about whether anyone touched
      // the switch. `localSettings` was read before the upsert, so it still holds the old value.
      if (typeof appSettings.priceTrackingEnabled !== 'undefined') {
        const wasEnabled = localSettings.priceTrackingEnabled === true;
        if (appSettings.priceTrackingEnabled !== wasEnabled) {
          await trackPoi(
            appSettings.priceTrackingEnabled
              ? TRACKING_POIS.FEATURE_TRACKING_ENABLED
              : TRACKING_POIS.FEATURE_TRACKING_DISABLED,
          );
        }
      }
      // Same reasoning as above: compared against what was stored, because this page posts every
      // one of its fields on every save.
      if (typeof appSettings.connectivityEnabled !== 'undefined') {
        const wasEnabled = localSettings.connectivityEnabled === true;
        if (appSettings.connectivityEnabled !== wasEnabled) {
          await trackPoi(
            appSettings.connectivityEnabled ? TRACKING_POIS.CONNECTIVITY_ENABLED : TRACKING_POIS.CONNECTIVITY_DISABLED,
          );
        }
      }
      // Only the switching off is counted. A register being turned back on says little - it is
      // usually somebody undoing a test - while turning one off is a verdict on that source, and
      // the one thing worth knowing about a data source nobody is contractually obliged to keep
      // serving us.
      if (typeof appSettings.connectivitySources !== 'undefined') {
        const before = normalizeSourceSwitches(localSettings.connectivitySources);
        for (const id of SOURCE_IDS) {
          if (before[id] === true && appSettings.connectivitySources[id] === false) {
            await trackPoi(TRACKING_POIS.CONNECTIVITY_SOURCE_DISABLED);
          }
        }
      }
    } catch (err) {
      logger.error(err);
      return reply.code(500).send({ error: 'Error while trying to write settings.' });
    }
    return reply.send();
  });
}
