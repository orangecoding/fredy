/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dockerfile = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../Dockerfile'), 'utf-8');

/**
 * Without an init as pid 1 nobody reaps the Chromium helper processes that get reparented when a
 * browser dies, and the container slowly fills up with `<defunct>` entries. Node cannot do the
 * reaping itself (libuv only waits for the pids it spawned), so this has to stay in the image.
 */
describe('Dockerfile init process', () => {
  it('installs tini', () => {
    expect(dockerfile).toMatch(/apt-get install[\s\S]*?\btini\b/);
  });

  it('runs the app under tini rather than as pid 1', () => {
    const entrypoint = dockerfile.match(/^ENTRYPOINT (.+)$/m)?.[1];
    const cmd = dockerfile.match(/^CMD (.+)$/m)?.[1];

    expect(entrypoint).toBeDefined();
    expect(JSON.parse(entrypoint)).toEqual(['/usr/bin/tini', '-g', '--']);
    expect(JSON.parse(cmd)).toEqual(['node', 'index.js']);
  });
});
