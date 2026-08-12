/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../services/logger.js';
import { isAdmin } from '../security.js';
import { assertAdapterFieldsAllowed, privilegedFieldError } from '../../services/security/adapterFields.js';
import { getNotificationAdapters } from '../../utils.js';
import { testFire } from '../../notification/testFire.js';

const notificationAdapter = await getNotificationAdapters();

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function notificationAdapterPlugin(fastify) {
  fastify.get('/', async () => {
    return notificationAdapter.map((adapter) => adapter.config).filter(Boolean);
  });

  fastify.post('/try', async (request, reply) => {
    const { id, fields } = request.body;
    const adapter = notificationAdapter.find((adapter) => adapter.config.id === id);
    if (adapter == null) {
      return reply.code(404).send();
    }
    // Same rule the channel save route enforces. Without it this endpoint is a way around it: the
    // adapter is invoked for real here, so a non-admin could set the sqlite adapter's dbPath and
    // have the server create a database file at any path it can write to.
    const allowed = assertAdapterFieldsAllowed(id, fields, isAdmin(request));
    if (!allowed.ok) {
      return reply.code(403).send({ error: privilegedFieldError(allowed.adapterId, allowed.field) });
    }
    try {
      await testFire(adapter, fields, { userId: request.session.currentUser });
      return reply.send();
    } catch (Exception) {
      logger.error('Error during notification adapter test:', Exception);
      return reply.code(500).send({ error: String(Exception) });
    }
  });
}
