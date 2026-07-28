/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';

// Same cached loader the job execution service uses, so there is one list of providers rather than
// two - and it resolves against the module's own location instead of the working directory.
const providers = await getProviders();

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function providerPlugin(fastify) {
  fastify.get('/', async () => {
    return providers.map((p) => p.metaInformation);
  });
}
