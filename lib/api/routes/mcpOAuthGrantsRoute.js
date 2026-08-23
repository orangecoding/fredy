/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { listGrants, revokeGrant } from '../../mcp/mcpOAuthStorage.js';

/**
 * The OAuth clients a user has let read their Fredy data, and the way to take that back.
 *
 * Mounted behind `authHook`, so `request.session.currentUser` is always set here; both routes key
 * on it rather than on anything the caller sends, which is what makes a client id harmless in
 * somebody else's hands.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function mcpOAuthGrantsPlugin(fastify) {
  fastify.get('/', async (request) => listGrants(request.session.currentUser));

  fastify.delete('/:clientId', async (request, reply) => {
    if (!revokeGrant(request.session.currentUser, request.params.clientId)) {
      return reply.code(404).send({ error: 'No such grant.' });
    }
    return { success: true };
  });
}
