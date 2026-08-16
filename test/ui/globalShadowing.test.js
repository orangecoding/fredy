/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No module may import something under the name of a global constructor.
 *
 * `ui/src/views/listings/Map.jsx` imported the map component as `Map`, which shadowed the global for
 * the whole file. A `new Map()` written months later then invoked a React function component as a
 * constructor, and the only sign of it was a TypeError thrown from inside that component, reading a
 * prop off `undefined` - nowhere near the line that caused it.
 *
 * Nothing else could have caught this. It compiles, it lints, the tests pass, and the page only
 * breaks when it renders, which this repo has no way to do. So it is checked as a rule about names,
 * which is where the mistake actually lives.
 *
 * The list is the globals somebody would plausibly write `new` in front of, or call. A component
 * legitimately named after one of these is fine - it just has to be imported under another name, the
 * way `MapCanvas` now is.
 */
const SHADOWED_GLOBALS = new Set([
  'Array',
  'Boolean',
  'Date',
  'Error',
  'Intl',
  'Map',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'WeakMap',
  'WeakSet',
]);

const UI_SOURCE = new URL('../../ui/src', import.meta.url).pathname;

/**
 * Every JavaScript and JSX file under `ui/src`.
 *
 * @param {string} dir
 * @returns {string[]} Absolute paths.
 */
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.jsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * The local names a file binds through its imports.
 *
 * Covers the three forms that can introduce one: the default import, an aliased named import, and a
 * namespace import. A plain named import cannot be at fault, because the name then comes from the
 * module being imported rather than being chosen here.
 *
 * @param {string} source
 * @returns {string[]}
 */
function importedNames(source) {
  const names = [];
  for (const [, clause] of source.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+['"]/gm)) {
    // `import Foo, { bar } from` and `import Foo from`
    const defaultImport = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.trim());
    if (defaultImport) {
      names.push(defaultImport[1]);
    }
    for (const [, alias] of clause.matchAll(/\bas\s+([A-Za-z_$][\w$]*)/g)) {
      names.push(alias);
    }
  }
  return names;
}

describe('the frontend does not shadow global constructors', () => {
  it('imports nothing under the name of a global', () => {
    const offences = [];
    for (const path of sourceFiles(UI_SOURCE)) {
      const source = readFileSync(path, 'utf-8');
      for (const name of importedNames(source)) {
        if (SHADOWED_GLOBALS.has(name)) {
          offences.push(`${path.slice(UI_SOURCE.length + 1)} imports "${name}"`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  /** The detection has to actually see the shape that caused the bug, or it proves nothing. */
  it('would have caught the import that caused this', () => {
    expect(importedNames(`import Map from '../../components/map/Map.jsx';`)).toContain('Map');
    expect(importedNames(`import { MapThing as Set } from './x.js';`)).toContain('Set');
    expect(importedNames(`import Renamed, { useState } from 'react';`)).toContain('Renamed');
    // A named import is the module's own name, not a choice made here, so it is not this test's business.
    expect(importedNames(`import { Map } from './x.js';`)).not.toContain('Map');
  });
});
