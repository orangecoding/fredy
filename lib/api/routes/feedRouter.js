/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getFeedChannel, getFeedItems } from '../../services/storage/notificationFeedStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { renderRssFeed } from '../../services/feed/rssFeed.js';

/**
 * The feed of an rss notification channel.
 *
 * Public on purpose: a feed reader cannot sign in, so the token in the path is the whole
 * credential, and it reaches nothing but this one channel's feed. An unknown token answers 404 like
 * any other path that does not exist, so a wrong guess learns nothing.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function feedPlugin(fastify) {
  fastify.get('/:token', async (request, reply) => {
    const channel = getFeedChannel(request.params.token);
    if (channel == null) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const settings = await getSettings();
    const xml = renderRssFeed({
      title: `Fredy: ${channel.name}`,
      link: settings?.baseUrl || null,
      description: `Listings Fredy found for the notification channel "${channel.name}".`,
      items: getFeedItems(channel.id),
    });
    // Each reader fetches with its own schedule; nothing in between should answer for Fredy.
    return reply.type('application/rss+xml; charset=utf-8').header('cache-control', 'no-store').send(xml);
  });
}
