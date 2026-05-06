/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';

const providerList = fs.readdirSync('./lib/provider').filter((file) => file.endsWith('.js'));
const providers = await Promise.all(providerList.map(async (pro) => import(`../../provider/${pro}`)));

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function providerPlugin(fastify) {
  fastify.get('/', async () => {
    return providers.map((p) => p.metaInformation);
  });
}
