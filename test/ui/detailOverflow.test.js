/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const uiSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src');

/**
 * One BEM element block (`&__name { ... }`) out of a stylesheet, up to its closing brace.
 *
 * @param {string} relative Path below `ui/src`.
 * @param {string} element The element name after `&__`.
 * @returns {string}
 */
function block(relative, element) {
  const less = fs.readFileSync(path.join(uiSrc, relative), 'utf-8');
  return less.match(new RegExp(`&__${element} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? '';
}

describe('long text in the listing detail stays inside its box (#537)', () => {
  it('caps a line badge, because coaches carry their whole route as the line name', () => {
    const line = block('components/transit/transit.less', 'line');
    expect(line).toMatch(/max-width: \d/);
    expect(line).toMatch(/overflow: hidden;/);
    expect(line).toMatch(/text-overflow: ellipsis;/);
  });

  it('lets the job chip grow with a name that wraps', () => {
    const chip = block('views/listings/components/ListingOrigin.less', 'chip');
    expect(chip).toMatch(/min-height: 24px;/);
    expect(chip).not.toMatch(/^\s*height:/m);
  });
});
