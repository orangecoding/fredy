/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings } from '../../services/storage/settingsStorage.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function demoPlugin(fastify) {
  fastify.get('/', async () => {
    const settings = await getSettings();
    return { demoMode: settings.demoMode };
  });
}
