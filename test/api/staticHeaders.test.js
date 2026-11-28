/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { staticFileHeaders } from '../../lib/api/staticHeaders.js';

let root;
let app;

/** The static registration as `api.js` makes it, over a directory with the files in question. */
beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fredy-static-'));
  fs.writeFileSync(path.join(root, 'sw.js'), 'self.addEventListener("push", () => {});');
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{"name":"Fredy"}');
  fs.writeFileSync(path.join(root, 'app-1a2b3c.js'), 'console.log(1);');
  app = Fastify();
  await app.register(fastifyStatic, { root, wildcard: false, setHeaders: staticFileHeaders });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('static files for the PWA', () => {
  it('serves the service worker as JavaScript that is always revalidated', async () => {
    const response = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/javascript/);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('serves the manifest with its own type, always revalidated', async () => {
    const response = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/manifest\+json/);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('leaves every other file alone', async () => {
    const response = await app.inject({ method: 'GET', url: '/app-1a2b3c.js' });
    expect(response.headers['cache-control']).not.toBe('no-cache');
  });
});
