/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The finance math lives in exactly one place: `lib/services/finance/`, reached from the browser
 * over `/api/finance/*`.
 *
 * It was briefly copied into `ui/src` to get the frontend out of `lib/`. That was the wrong trade:
 * backend and frontend judge the *same* listings - the API decides which ones the affordability
 * filter returns, the UI paints the verdict beside them - so two implementations of the same
 * amortization are a contradiction waiting to ship, and no amount of "keep them in sync" tooling
 * makes that safe.
 *
 * Constants may be duplicated (they are values, not behaviour) and are checked for drift below.
 */
const MATH_MODULES = [
  'affordability.js',
  'amortization.js',
  'calculate.js',
  'financing.js',
  'profile.js',
  'profileSections.js',
  'listingFilter.js',
];

/** Copies that are allowed, because they hold values rather than behaviour. */
const CONSTANT_COPIES = [['lib/services/finance/constants.js', 'ui/src/services/finance/constants.js']];

const read = (relativePath) => fs.readFileSync(path.resolve(relativePath), 'utf8');

/**
 * Every .js/.jsx file under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

describe('finance math has one home', () => {
  it.each(MATH_MODULES)('ui/src holds no copy of %s', (moduleName) => {
    expect(fs.existsSync(path.join('ui/src/services/finance', moduleName))).toBe(false);
  });

  it('no file under ui/src imports a finance math module', () => {
    const offenders = sourceFiles('ui/src').filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return MATH_MODULES.some((moduleName) => source.includes(`finance/${moduleName}`));
    });
    expect(offenders).toEqual([]);
  });

  it('no file under ui/src imports out of lib/', () => {
    const offenders = sourceFiles('ui/src').filter((file) =>
      // Relative escapes only; a package subpath containing "lib" is unrelated.
      /from\s+['"](?:\.\.\/)+lib\//.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('the frontend constants copy carries no functions, only values', () => {
    const source = read('ui/src/services/finance/constants.js');
    expect(source).not.toMatch(/^export function /m);
  });

  it.each(CONSTANT_COPIES)('%s and %s agree on every shared constant', (backendPath, frontendPath) => {
    // Compared by value rather than by text: the frontend copy deliberately omits the helpers and
    // carries a different header, so a byte comparison would be noise.
    const values = (source) =>
      Object.fromEntries(
        [...source.matchAll(/^export const ([A-Z_]+) = ([\s\S]*?);$/gm)].map(([, name, value]) => [
          name,
          value.replace(/\s+/g, ''),
        ]),
      );
    const backend = values(read(backendPath));
    const frontend = values(read(frontendPath));

    expect(Object.keys(frontend).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(frontend)) {
      expect(backend[name], `${name} differs between the two copies`).toBe(value);
    }
  });
});
