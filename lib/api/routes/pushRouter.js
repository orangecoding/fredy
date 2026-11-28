/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getOrCreateVapidKeys, sendPushToUser } from '../../services/push/webPushService.js';
import {
  listPushDevices,
  removePushSubscription,
  upsertPushSubscription,
} from '../../services/storage/pushSubscriptionStorage.js';
import { isPubliclyFetchableUrl } from '../../services/security/outboundUrl.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import logger from '../../services/logger.js';

/** Longest endpoint accepted. Real ones are a few hundred characters. */
const MAX_ENDPOINT_LENGTH = 2048;
/** Longest key accepted. A P-256 public key is 87 characters in base64url, the auth secret 22. */
const MAX_KEY_LENGTH = 256;

/**
 * The subscription a browser posts, as `PushSubscription.toJSON()` shapes it, or null when it is
 * not one.
 *
 * Only public https endpoints are taken: every push service is one, and an endpoint is a URL the
 * server will later send requests to, so anything else would let a user aim Fredy at a host inside
 * its own network. The check is the one the picture download and add-by-url already use.
 *
 * @param {unknown} body
 * @returns {{endpoint: string, p256dh: string, auth: string}|null}
 */
export function parseSubscription(body) {
  const subscription = body?.subscription ?? body;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  try {
    if (new URL(endpoint).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (!isPubliclyFetchableUrl(endpoint)) return null;
  const isKey = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH;
  if (!isKey(p256dh) || !isKey(auth)) return null;
  return { endpoint, p256dh, auth };
}

/**
 * The origin the request came from, e.g. `https://fredy.example.org`.
 *
 * Browsers send `Origin` on every POST; behind a proxy `request.protocol` and `request.host`
 * follow the forwarded headers (`trustProxy`), so the fallback is right there as well.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {string|null}
 */
function originOf(request) {
  const header = request.headers.origin;
  if (typeof header === 'string' && header !== 'null') return header;
  return request.host ? `${request.protocol}://${request.host}` : null;
}

/**
 * Web Push devices of the signed-in user (#542).
 *
 * Mounted behind `authHook` under `/api/user/push`, so `request.session.currentUser` is always set,
 * and every route reads and writes that user's rows only.
 *
 * In demo mode every visitor shares one account, so its devices would be everybody's: the list
 * would show the other visitors' phones and the test button would push to all of them. Only an
 * admin gets through there, as with the other write routes.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function pushPlugin(fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    const settings = await getSettings();
    if (settings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'Push notifications are not available in demo mode.' });
    }
  });

  /** The key a browser subscribes with (`applicationServerKey`). */
  fastify.get('/public-key', async () => {
    const { publicKey } = await getOrCreateVapidKeys();
    return { publicKey };
  });

  /** This user's devices. */
  fastify.get('/subscriptions', async (request) => listPushDevices(request.session.currentUser));

  /** Register this device, or refresh it. */
  fastify.post('/subscriptions', async (request, reply) => {
    const subscription = parseSubscription(request.body);
    if (subscription == null) {
      return reply.code(400).send({ error: 'Not a valid push subscription.' });
    }
    const userAgent = request.headers['user-agent'];
    upsertPushSubscription(request.session.currentUser, {
      ...subscription,
      origin: originOf(request),
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
    });
    return reply.code(200).send({ ok: true });
  });

  /** Remove a device: this one by `endpoint`, or one from the list by `id`. */
  fastify.delete('/subscriptions', async (request, reply) => {
    const { endpoint, id } = request.body ?? {};
    if (typeof endpoint !== 'string' && typeof id !== 'string') {
      return reply.code(400).send({ error: 'endpoint or id is required.' });
    }
    const removed = removePushSubscription(request.session.currentUser, { endpoint, id });
    return reply.code(200).send({ removed });
  });

  /** A test notification to every device of this user. */
  fastify.post('/test', async (request, reply) => {
    try {
      const result = await sendPushToUser(
        request.session.currentUser,
        {
          title: 'Fredy',
          body: 'Push notifications work on this device.',
          url: '/#/settings/notifications',
          tag: 'fredy-test',
        },
        { urgency: 'high' },
      );
      return reply.code(200).send(result);
    } catch (error) {
      logger.error('Could not send the test push', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
