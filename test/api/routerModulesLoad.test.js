/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTES_DIR = path.join(ROOT, 'lib', 'api', 'routes');

const routerFiles = fs
  .readdirSync(ROUTES_DIR)
  .filter((file) => file.endsWith('.js'))
  .sort();

/**
 * Link every API route module in a real Node process.
 *
 * This exists because of a real failure. A named export was deleted from
 * `lib/services/security/adapterFields.js` while `jobRouter.js` still imported it. ESM resolves
 * named imports at link time, so the server threw `SyntaxError: ... does not provide an export
 * named 'sanitiseNotificationAdapter'` and refused to boot - while the whole suite stayed green,
 * because nothing imported a router. `yarn lint` misses it too: ESLint does not check named
 * exports across files.
 *
 * The check deliberately spawns `node` rather than `import()`-ing from inside the test. Vitest
 * loads modules through Vite, which rewrites named imports into property accesses on the module
 * namespace and therefore does *not* fail on a missing named export - verified by reintroducing
 * the dangling import and watching an in-test `import()` pass while `node` failed. Only a real
 * Node link step reproduces what the server does at startup.
 *
 * One spawn for all routers, because module loading here has real side effects (the notification
 * adapters and the providers are read from disk) and doing that eighteen times over would be slow
 * for no extra signal.
 */
describe('every API route module links in a real Node process', () => {
  it('finds the route modules', () => {
    expect(routerFiles.length).toBeGreaterThan(0);
  });

  it('imports all of them without a link error', () => {
    const specifiers = routerFiles.map((file) => pathToFileURL(path.join(ROUTES_DIR, file)).href);
    const script = `
      const specifiers = ${JSON.stringify(specifiers)};
      for (const specifier of specifiers) {
        const module = await import(specifier);
        if (typeof module.default !== 'function') {
          console.error('NOT_A_PLUGIN ' + specifier);
          process.exit(2);
        }
      }
    `;

    let result;
    try {
      result = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
        env: { ...process.env, TEST_MODE: 'offline' },
      });
    } catch (error) {
      const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
      throw new Error(`A route module failed to link:\n${detail}`, { cause: error });
    }

    expect(result).not.toMatch(/NOT_A_PLUGIN/);
  });
});
