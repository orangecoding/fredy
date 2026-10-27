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
    // `addByUrl` is a fact about the code, not the portal, so it rides along rather than living in
    // `metaInformation`: the "add listing" dialog can say "not supported yet" before anything is
    // sent, and the flag can never claim a reader that is not there.
    return providers.map((p) => ({
      ...p.metaInformation,
      addByUrl: typeof p.config?.fetchListingByUrl === 'function',
    }));
  });
}
