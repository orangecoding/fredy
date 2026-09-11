/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Transport for the idealista android app's JSON API.
 *
 * The app talks to `app.idealista.<tld>` rather than to the website, and that host serves JSON to a
 * plain HTTPS request. What it does want is proof
 * that the caller is the app, which is three things - the client key, an app version and a device
 * id in every request, and a signature over the parameters.
 *
 * There are three of those hosts, one per country, and they are the same api: the same client key,
 * the same signing key, the same paths with the country code swapped. Which one a request goes to
 * is decided per call by the portal the job's url belongs to (`./portal.js`), never by anything
 * held here - the only thing kept per host is the bearer token, since a token minted by one
 * country's api means nothing to another's.
 *
 * The signature is an HMAC-SHA256 whose key is the ASCII string `bXBUUW5TODhKdFhENmQyRQ==`. It
 * looks like base64 and is not: the app uses those characters verbatim as the key bytes.
 *
 * The signed message is `seed + method + query + body`, where query and body are each their
 * parameters sorted by name and joined `name=value&name=value`, url-encoded the way
 * `java.net.URLEncoder` does it - space becomes `+`, and `* - _ .` are left alone. `seed` is a
 * fresh UUID per request and travels in a header of its own so the server can rebuild the message.
 *
 * `reverse-engineered-idealista.md` records how all of this was measured, and what else the api
 * takes.
 *
 * Two courtesies keep the api treating this installation the way it treats a phone. Every request
 * carries a stable device id - see `./device-id.js` - because a new id per process is many
 * "installs" from one address. And `call` walks requests out one at a time, a breath apart,
 * because a phone never fires two at once. When the api refuses a request all the same - a 407,
 * or its edge dropping the connection without a status - `call` goes quiet instead of knocking
 * harder, fails fast while it is quiet, and doubles the silence every time the refusal outlasts
 * it.
 */

import { createHmac, randomBytes, randomUUID } from 'crypto';
import { idealistaDeviceId } from './device-id.js';
import { sleep } from '../../utils.js';
import logger from '../logger.js';
/** @import { Portal } from './portal.js' */

const CLIENT_KEY = '5b85c03c16bbb85d96e232b112ee85dc';
const CLIENT_SECRET = 'idea;andr01d';
const SIGNING_KEY = 'bXBUUW5TODhKdFhENmQyRQ==';
const APP_VERSION = '15.3.0';
const USER_AGENT = 'Dalvik/2.1.0 (Linux; U; Android 14; Pixel 7 Build/UP1A.231005.007)';

/** The api version every endpoint below is served under. The country follows it in the path. */
const API_VERSION = '3.5';

/**
 * Where one page of a search is asked for.
 *
 * @param {Portal} portal
 * @returns {string}
 */
export function searchPath(portal) {
  return `/api/${API_VERSION}/${portal.country}/search`;
}

/**
 * Where one level of the catalogue of locations is asked for.
 *
 * @param {Portal} portal
 * @returns {string}
 */
export function locationsPath(portal) {
  return `/api/${API_VERSION}/${portal.country}/search/locations`;
}

/** Adverts one response carries at most, whatever `maxItems` asks for. */
export const MAX_ITEMS_PER_PAGE = 50;

/**
 * How far apart two requests leave. A phone paces its screens, and a run firing a few dozen
 * requests in a burst is exactly what the api's abuse wall reads. Four hundred milliseconds
 * walks a big search out in seconds and changes nothing the user sees.
 */
export const REQUEST_GAP_MS = 400;

/**
 * How long to stay silent after the api refuses a request. The silence doubles every time the
 * refusal outlasts it, up to two hours. The first is a quarter of an hour: that is how long a
 * refusal of ours lasted before the api answered again.
 */
const THROTTLE_FIRST_MS = 15 * 60_000;
const THROTTLE_CAP_MS = 2 * 60 * 60_000;

/**
 * Dropped connections that pass for our own network before they count as a refusal. One reset
 * is weather; several in a row is the api's edge slamming the door, which is how a block
 * manifests when it does not come with a status.
 */
const DROPPED_TOLERANCE = 3;

/** The lane every request takes, so two jobs running together still fire one shot at a time. */
let lane = Promise.resolve();
let lastFiredAt = 0;
let quietUntil = 0;
let quietMs = THROTTLE_FIRST_MS;
let droppedInARow = 0;

/** @type {Promise<string>|null} The device id, asked of the settings table once per process. */
let deviceIdPromise = null;

/**
 * The stable device id every request carries.
 *
 * @returns {Promise<string>}
 */
function deviceId() {
  deviceIdPromise ??= idealistaDeviceId().catch((error) => {
    // Without the settings table the run still works; it just looks like a fresh install.
    logger.debug(`Idealista: no stored device id (${error.message}); minting one for this process.`);
    return randomBytes(8).toString('hex');
  });
  return deviceIdPromise;
}

/** Refresh this long before the token expires, so a request cannot race its own expiry. */
const TOKEN_MARGIN_MS = 60_000;

/**
 * One token per api host. A token is granted by a country's api to this installation and is not
 * read by the other two, so a job on .pt must not be handed the token a job on .it just minted.
 *
 * @type {Map<string, {value: string, expiresAt: number}>}
 */
const tokens = new Map();

/**
 * The refresh in flight per host, so concurrent jobs on one country mint one token, not two.
 *
 * @type {Map<string, Promise<string>>}
 */
const tokenRequests = new Map();

/**
 * Url-encode one value the way `java.net.URLEncoder.encode(value, "UTF-8")` does.
 *
 * `encodeURIComponent` differs from it in two places, and both change the signature: a space has to
 * become `+` rather than `%20`, and `!`, `'`, `(`, `)` and `~` are escaped rather than kept.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * The canonical form of one parameter set: sorted by name, joined, every part encoded.
 *
 * @param {Array<[string, unknown]>} params
 * @returns {string}
 */
function canonicalise(params) {
  return [...params]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => `${formEncode(name)}=${formEncode(value)}`)
    .join('&');
}

/**
 * Sign one request.
 *
 * @param {string} method The http method, uppercase.
 * @param {Array<[string, unknown]>} query
 * @param {Array<[string, unknown]>} body
 * @returns {{seed: string, signature: string}}
 */
export function sign(method, query, body) {
  const seed = randomUUID();
  const message = seed + method + canonicalise(query) + canonicalise(body);
  return { seed, signature: createHmac('sha256', SIGNING_KEY).update(message, 'utf8').digest('hex') };
}

/**
 * @param {Array<[string, unknown]>} params
 * @returns {string} the query string as it is sent, which is not the canonical form it is signed in
 */
function queryString(params) {
  return params.map(([name, value]) => `${name}=${encodeURIComponent(String(value))}`).join('&');
}

/**
 * @param {Array<[string, unknown]>} body
 * @returns {string}
 */
function formBody(body) {
  return body.map(([name, value]) => `${formEncode(name)}=${formEncode(value)}`).join('&');
}

/**
 * Fetch a bearer token, which the api hands out to the app itself rather than to a user.
 *
 * @param {Portal} portal The country whose api is being asked.
 * @param {string} id The device id the token belongs to.
 * @returns {Promise<string>}
 */
async function mintToken(portal, id) {
  const query = /** @type {Array<[string, unknown]>} */ ([
    ['t', id],
    ['k', CLIENT_KEY],
  ]);
  const body = /** @type {Array<[string, unknown]>} */ ([
    ['grant_type', 'client_credentials'],
    ['scope', 'write'],
  ]);
  const { seed, signature } = sign('POST', query, body);
  const credentials = Buffer.from(`${formEncode(CLIENT_KEY)}:${formEncode(CLIENT_SECRET)}`).toString('base64');

  const response = await fetch(`${portal.apiHost}/api/oauth/token?${queryString(query)}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      app_version: APP_VERSION,
      device_identifier: id,
      Signature: signature,
      seed,
    },
    body: formBody(body),
  });

  if (!response.ok) {
    throw new Error(`idealista refused a token: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }

  const granted = await response.json();
  if (granted?.access_token == null) {
    throw new Error('idealista answered the token request without a token');
  }

  const lifetime = Number(granted.expires_in) * 1000;
  tokens.set(portal.apiHost, {
    value: granted.access_token,
    expiresAt: Date.now() + (Number.isFinite(lifetime) ? lifetime : 0) - TOKEN_MARGIN_MS,
  });
  return granted.access_token;
}

/**
 * The current token of one country's api, minting one when there is none left.
 *
 * @param {Portal} portal
 * @param {string} id The device id to mint the token for.
 * @returns {Promise<string>}
 */
async function currentToken(portal, id) {
  const held = tokens.get(portal.apiHost);
  if (held != null && held.expiresAt > Date.now()) return held.value;

  let request = tokenRequests.get(portal.apiHost);
  if (request == null) {
    request = mintToken(portal, id).finally(() => tokenRequests.delete(portal.apiHost));
    tokenRequests.set(portal.apiHost, request);
  }
  return request;
}

/**
 * Drop a token that is held, so the next call mints a fresh one.
 *
 * @param {Portal} [portal] The country to forget. Every one of them when none is named, which is
 *   what the tests reset with.
 * @returns {void}
 */
export function forgetToken(portal) {
  if (portal == null) tokens.clear();
  else tokens.delete(portal.apiHost);
}

/**
 * Note the silence after a refusal, doubling the one before it.
 *
 * @param {string} reason
 * @returns {void}
 */
function registerThrottle(reason) {
  quietUntil = Date.now() + quietMs;
  logger.warn(
    `Idealista refused this installation (${reason}); staying silent for ${Math.round(quietMs / 60_000)} minutes.`,
  );
  quietMs = Math.min(quietMs * 2, THROTTLE_CAP_MS);
}

/**
 * Run one request through the lane.
 *
 * Inside a silence the request fails fast rather than knocking again: a queue of jobs knocking on
 * a door that just slammed is how the silence turns into a ban.
 *
 * @param {() => Promise<any>} task
 * @returns {Promise<any>}
 */
function enqueue(task) {
  const run = lane.then(async () => {
    if (Date.now() < quietUntil) {
      throw new Error(`idealista is silent to this installation until ${new Date(quietUntil).toISOString()}.`);
    }

    await sleep(Math.max(0, lastFiredAt + REQUEST_GAP_MS - Date.now()));
    lastFiredAt = Date.now();

    try {
      const result = await task();
      droppedInARow = 0;
      if (quietUntil !== 0) {
        // The door opened again, so the next silence starts from the first one.
        quietUntil = 0;
        quietMs = THROTTLE_FIRST_MS;
      }
      return result;
    } catch (error) {
      const status = /** @type {any} */ (error).httpStatus;
      if (status === 407 || status === 429) {
        registerThrottle(`the api answered ${status}`);
      } else if (/** @type {any} */ (error).dropped === true) {
        droppedInARow += 1;
        if (droppedInARow >= DROPPED_TOLERANCE) registerThrottle('the edge keeps dropping the connection');
      }
      throw error;
    }
  });
  lane = run.catch(() => {});
  return run;
}

/**
 * Fire one request at the api. Only ever called through {@link call}, which paces it.
 *
 * A rejected token is retried once with a fresh one: a token outlives a job run by hours, so the
 * one held has usually been minted by an earlier run and may have been revoked since.
 *
 * @param {Portal} portal The country whose api is being asked.
 * @param {string} path
 * @param {Array<[string, unknown]>} query
 * @param {Array<[string, unknown]>} body
 * @param {boolean} retryOnUnauthorised
 * @param {'POST'|'GET'} method
 * @returns {Promise<any>} the parsed response
 */
async function fire(portal, path, query, body, retryOnUnauthorised, method = 'POST') {
  const id = await deviceId();
  const fullQuery = /** @type {Array<[string, unknown]>} */ ([['t', id], ['k', CLIENT_KEY], ...query]);
  const { seed, signature } = sign(method, fullQuery, body);

  /** @type {RequestInit} */
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${await currentToken(portal, id)}`,
      'User-Agent': USER_AGENT,
      app_version: APP_VERSION,
      device_identifier: id,
      Signature: signature,
      seed,
    },
  };
  if (method === 'POST') {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = formBody(body);
  }

  let response;
  try {
    response = await fetch(`${portal.apiHost}${path}?${queryString(fullQuery)}`, options);
  } catch (error) {
    // The edge dropped the connection without a status, which is how a block manifests on the
    // wire. The lane counts these and only reads a slammed door after a few in a row.
    /** @type {any} */ (error).dropped = true;
    throw error;
  }

  if (response.status === 401 && retryOnUnauthorised) {
    logger.debug(`Idealista rejected the api token for ${portal.apiHost}; minting a new one.`);
    forgetToken(portal);
    return fire(portal, path, query, body, false, method);
  }

  if (!response.ok) {
    const error = new Error(
      `idealista api ${path} answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
    /** @type {any} */ (error).httpStatus = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Call one endpoint of one country's api.
 *
 * The pacing is shared by all three hosts on purpose: they are one api behind one abuse wall, and
 * what it reads is the traffic of this installation rather than of a hostname.
 *
 * @param {Portal} portal The country to ask, derived from the job's url.
 * @param {string} path
 * @param {{query?: Array<[string, unknown]>, body?: Array<[string, unknown]>, method?: 'POST'|'GET'}} [options]
 * @returns {Promise<any>} the parsed response
 * @throws {Error} when the api answers anything but 2xx, and while a throttle silence lasts
 */
export async function call(portal, path, { query = [], body = [], method = 'POST' } = {}) {
  return enqueue(() => fire(portal, path, query, body, true, method));
}

/**
 * Forget the pacing state - the lane, the silence, the counters. Exists for the tests, which run
 * their own clock.
 *
 * @returns {void}
 */
export function resetPacing() {
  lane = Promise.resolve();
  lastFiredAt = 0;
  quietUntil = 0;
  quietMs = THROTTLE_FIRST_MS;
  droppedInARow = 0;
}
