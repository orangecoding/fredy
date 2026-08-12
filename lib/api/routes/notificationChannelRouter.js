/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../services/logger.js';
import { isAdmin } from '../security.js';
import { getNotificationAdapters } from '../../utils.js';
import { describeChannel, redactSecrets } from '../../notification/adapterSummary.js';
import { testFire } from '../../notification/testFire.js';
import { assertPrivilegedFieldsUnchanged, privilegedFieldError } from '../../services/security/adapterFields.js';
import { canUseChannel, canEditChannel } from '../../services/security/channelAccess.js';
import * as channelStorage from '../../services/storage/configuredAdapterStorage.js';

const adapters = await getNotificationAdapters();

/**
 * @param {string} adapterId
 * @returns {Object|null} The adapter's static config, or null when the adapter is gone.
 */
const configOf = (adapterId) => adapters.find((a) => a.config?.id === adapterId)?.config ?? null;

/**
 * Shape a channel for the client.
 *
 * `fields` is omitted entirely from the list: a table has no use for a bot token, and the surest
 * way not to leak one is not to serialise it. The single-channel route opts in, and decides
 * separately whether the secret values inside come through.
 *
 * @param {import('../../services/storage/configuredAdapterStorage.js').Channel} channel
 * @param {{id: string, isAdmin?: boolean}} user
 * @param {Map<string, number>} usage
 * @param {{includeFields?: boolean, revealSecrets?: boolean}} [options]
 * @returns {Object}
 */
const toDto = (channel, user, usage, { includeFields = false, revealSecrets = false } = {}) => {
  const adapterConfig = configOf(channel.adapterId);
  return {
    id: channel.id,
    adapterId: channel.adapterId,
    adapterName: adapterConfig?.name ?? channel.adapterId,
    name: channel.name,
    destination: describeChannel(adapterConfig, channel.fields),
    visibility: channel.visibility,
    usedByJobs: usage.get(channel.id) ?? 0,
    canEdit: canEditChannel(user, channel),
    isOwner: channel.userId === user.id,
    ...(includeFields ? { fields: redactSecrets(adapterConfig, channel.fields, { reveal: revealSecrets }) } : {}),
  };
};

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function notificationChannelPlugin(fastify) {
  fastify.get('/', async (request) => {
    const usage = channelStorage.getUsageCounts();
    return channelStorage
      .getAllChannels()
      .filter((channel) => canUseChannel(request.currentUser, channel))
      .map((channel) => toDto(channel, request.currentUser, usage));
  });

  fastify.get('/:id', async (request, reply) => {
    const channel = channelStorage.getChannel(request.params.id);
    if (channel == null) {
      return reply.code(404).send({ error: 'Notification channel not found' });
    }
    if (!canUseChannel(request.currentUser, channel)) {
      return reply.code(403).send({ error: 'You are not allowed to see this notification channel.' });
    }
    // Secrets travel only to someone who may edit the channel. A user who was granted *use* of a
    // shared channel can still open it to clone it, but the credentials come back blank.
    return toDto(channel, request.currentUser, channelStorage.getUsageCounts(), {
      includeFields: true,
      revealSecrets: canEditChannel(request.currentUser, channel),
    });
  });

  fastify.post('/', async (request, reply) => {
    const body = request.body ?? {};
    const { id = null, adapterId, name } = body;
    const requestIsAdmin = isAdmin(request);
    // A merge, not an overwrite: a key the body does not carry keeps its stored value, a key it
    // does carry - even an empty one - replaces it. Reading the raw body's own keys (rather than a
    // destructured default) is what tells "omitted" apart from "sent empty": an ordinary rename
    // that leaves `fields` out of the body must not wipe stored secrets, and a save that leaves
    // `visibility` out must not silently demote a shared channel back to private.
    const hasFieldsKey = Object.prototype.hasOwnProperty.call(body, 'fields');
    const hasVisibilityKey = Object.prototype.hasOwnProperty.call(body, 'visibility');

    const existing = id ? channelStorage.getChannel(id) : null;
    if (id && existing == null) {
      return reply.code(404).send({ error: 'Notification channel not found' });
    }
    if (existing && !canEditChannel(request.currentUser, existing)) {
      return reply.code(403).send({ error: 'You are not allowed to change this notification channel.' });
    }

    // The adapter type is fixed at creation: the stored fields only make sense for one adapter.
    const resolvedAdapterId = existing ? existing.adapterId : adapterId;
    if (configOf(resolvedAdapterId) == null) {
      return reply.code(400).send({ error: 'Unknown notification type' });
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      return reply.code(400).send({ error: 'A notification channel needs a name.' });
    }

    // No existing row means there is nothing stored to fall back to, so a create with no `fields`
    // key is `{}`, same as before.
    const resolvedFields = hasFieldsKey ? (body.fields ?? {}) : existing ? existing.fields : {};

    // Only an admin decides who may use a channel, and only when the body actually asks to change
    // it - omitting the key on an update keeps the stored value, for admins as well as non-admins.
    // A non-admin's channel is always private regardless of the body, which is what keeps one
    // user's credentials from reaching the whole instance by default; a create with no key is
    // private too, admin or not.
    const resolvedVisibility =
      requestIsAdmin && hasVisibilityKey
        ? channelStorage.normaliseVisibility(body.visibility)
        : existing
          ? existing.visibility
          : channelStorage.VISIBILITY.PRIVATE;

    // Checked against the field bag that is actually about to be stored (post-merge), so a merge
    // that falls back to the existing value can never slip a privileged field past this guard.
    const guard = assertPrivilegedFieldsUnchanged(
      resolvedAdapterId,
      resolvedFields,
      existing?.fields ?? {},
      requestIsAdmin,
    );
    if (!guard.ok) {
      return reply.code(403).send({ error: privilegedFieldError(guard.adapterId, guard.field) });
    }

    try {
      const channelId = channelStorage.upsertChannel({
        id: existing?.id,
        userId: existing?.userId ?? request.session.currentUser,
        adapterId: resolvedAdapterId,
        name: name.trim(),
        fields: resolvedFields,
        visibility: resolvedVisibility,
      });
      const saved = channelStorage.getChannel(channelId);
      return reply.send(toDto(saved, request.currentUser, channelStorage.getUsageCounts()));
    } catch (error) {
      logger.error('Failed to save notification channel', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    const channel = channelStorage.getChannel(request.params.id);
    if (channel == null) {
      return reply.code(404).send({ error: 'Notification channel not found' });
    }
    if (!canEditChannel(request.currentUser, channel)) {
      return reply.code(403).send({ error: 'You are not allowed to delete this notification channel.' });
    }

    // Deleting a channel out from under a job would leave that job quietly notifying nobody, which
    // is the worst failure this app has. The jobs are named so the UI can say which ones.
    const jobs = channelStorage.getJobsUsingChannel(channel.id);
    if (jobs.length > 0) {
      return reply.code(409).send({ error: 'This notification channel is still used by jobs.', jobs });
    }

    channelStorage.removeChannel(channel.id);
    return reply.send();
  });

  fastify.post('/:id/try', async (request, reply) => {
    const channel = channelStorage.getChannel(request.params.id);
    if (channel == null) {
      return reply.code(404).send({ error: 'Notification channel not found' });
    }
    if (!canUseChannel(request.currentUser, channel)) {
      return reply.code(403).send({ error: 'You are not allowed to use this notification channel.' });
    }
    const adapter = adapters.find((a) => a.config?.id === channel.adapterId);
    if (adapter == null) {
      return reply.code(404).send({ error: 'Unknown notification type' });
    }

    try {
      // Stored fields, not client-supplied ones: the client never received the secrets.
      await testFire(adapter, channel.fields, { userId: request.session.currentUser });
      return reply.send();
    } catch (error) {
      logger.error('Error during notification channel test:', error);
      return reply.code(500).send({ error: String(error) });
    }
  });
}
