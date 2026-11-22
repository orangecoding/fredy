/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../services/logger.js';
import { getNotificationAdapters } from '../../utils.js';
import { redactSecrets } from '../../notification/adapterSummary.js';
import { canUseChannel, canEditChannel } from '../../services/security/channelAccess.js';
import * as channelStorage from '../../services/storage/configuredAdapterStorage.js';
import {
  configOf,
  deleteChannel,
  listUsableChannels,
  saveChannel,
  summarizeChannel,
  testChannel,
} from '../../services/channels/channelService.js';
import { sendFailure } from '../../services/serviceResult.js';

const adapters = await getNotificationAdapters();

/**
 * Shape a single channel for the client: its summary, and its fields for the editor.
 *
 * The list leaves `fields` out entirely - a table has no use for a bot token, and the surest way not
 * to leak one is not to serialise it. A single channel carries them, and whether the secret values
 * inside come through is decided separately.
 *
 * @param {import('../../services/storage/configuredAdapterStorage.js').Channel} channel
 * @param {{id: string, isAdmin?: boolean}} user
 * @param {{revealSecrets?: boolean}} [options]
 * @returns {Object}
 */
const toDto = (channel, user, { revealSecrets = false } = {}) => {
  const adapterConfig = configOf(adapters, channel.adapterId);
  return {
    ...summarizeChannel(channel, user, channelStorage.getUsageCounts(), adapterConfig),
    fields: redactSecrets(adapterConfig, channel.fields, { reveal: revealSecrets }),
  };
};

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function notificationChannelPlugin(fastify) {
  fastify.get('/', async (request) => listUsableChannels(request.currentUser));

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
    return toDto(channel, request.currentUser, { revealSecrets: canEditChannel(request.currentUser, channel) });
  });

  // Every rule a save is held to lives in `channelService.saveChannel`, which the MCP channel tools
  // call too. The form holds every stored value and sends them all back, so its `fields` replace the
  // stored bag; leaving the key out keeps it, which is what a rename does.
  fastify.post('/', async (request, reply) => {
    const body = request.body ?? {};
    try {
      const saved = await saveChannel(request.currentUser, {
        id: body.id ?? null,
        adapterId: body.adapterId,
        name: body.name,
        fields: body.fields,
        visibility: body.visibility,
      });
      if (!saved.ok) return sendFailure(reply, saved);
      return reply.send(
        summarizeChannel(saved.channel, request.currentUser, channelStorage.getUsageCounts(), saved.adapterConfig),
      );
    } catch (error) {
      logger.error('Failed to save notification channel', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    const deleted = deleteChannel(request.currentUser, request.params.id);
    // A refused delete names the jobs still using the channel, so the user knows what to detach
    // first. Everything else about the refusal is the shared sentence and status code.
    if (!deleted.ok) return sendFailure(reply, deleted, 'error', deleted.jobs ? { jobs: deleted.jobs } : {});
    return reply.send();
  });

  fastify.post('/:id/try', async (request, reply) => {
    const tested = await testChannel(request.currentUser, request.params.id);
    if (!tested.ok) return sendFailure(reply, tested);
    return reply.send();
  });
}
