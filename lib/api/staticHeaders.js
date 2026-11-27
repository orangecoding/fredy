/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import path from 'path';

/**
 * Files served from the root of the SPA whose name stays the same across releases.
 *
 * The bundles are content-hashed, so a cached copy of one is never wrong. The service worker and
 * the web app manifest keep their names, so a cached copy would outlive an update. Browsers check
 * the worker for updates on their own; `no-cache` makes sure that check reaches the server.
 */
const REVALIDATED_FILES = new Set(['sw.js', 'manifest.webmanifest']);

/**
 * The `setHeaders` hook of the `@fastify/static` registration in `api.js`.
 *
 * @param {import('fastify').FastifyReply} reply
 * @param {string} filePath Absolute path of the file being served.
 * @returns {void}
 */
export function staticFileHeaders(reply, filePath) {
  if (REVALIDATED_FILES.has(path.basename(filePath))) {
    reply.header('Cache-Control', 'no-cache');
  }
}
