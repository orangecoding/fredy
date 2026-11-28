/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indexLess = fs.readFileSync(path.join(root, 'ui/src/Index.less'), 'utf-8');

describe('filterable select', () => {
  // Semi renders the search of a `filter` select as a `.semi-select-input`, which is also a
  // `.semi-input-wrapper`. The field rule gives every input wrapper an edge and a fill, so an open
  // select showed a second box inside itself (the channel type picker, the job and provider pickers).
  it('draws no box of its own around the search inside the select', () => {
    const rule = indexLess.match(
      /\.semi-select \.semi-select-content-wrapper \.semi-select-input\.semi-input-wrapper \{[^}]*\}/,
    );
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/border: 0 !important;/);
    expect(rule[0]).toMatch(/background-color: transparent !important;/);
  });

  it('comes after the rule that gives every field its edge, so it wins on order as well', () => {
    const fieldRule = indexLess.indexOf('.semi-autocomplete .semi-input-wrapper {');
    const fix = indexLess.indexOf('.semi-select .semi-select-content-wrapper .semi-select-input');
    expect(fieldRule).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(fieldRule);
  });
});
