/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');

// node-fetch 3 dropped the `timeout` option and ignores it silently. A Nominatim that accepted the
// connection and never answered held a job run forever, and with it the scheduler's next round.
describe('outgoing requests carry a real time limit', () => {
  it.each([
    'lib/services/geocoding/client/nominatimClient.js',
    'lib/services/transit/transitousClient.js',
    'lib/services/poi/overpassClient.js',
    'lib/services/tracking/Tracker.js',
    'lib/notification/adapter/http.js',
  ])('%s aborts through a signal, not the ignored timeout option', (file) => {
    const source = read(file);
    expect(source).toMatch(/signal: AbortSignal\.timeout\(/);
    expect(source).not.toMatch(/^\s*timeout: [A-Z0-9_]+,?$/m);
    expect(source).not.toMatch(/\btimeout: 10000\b/);
  });
});
