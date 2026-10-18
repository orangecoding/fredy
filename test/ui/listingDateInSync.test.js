/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The date a listing shows, in the two views that show one.
 *
 * The list is sorted by `published_at` - the portal's own date, falling back to the day Fredy
 * first saw the advert - and the grid renders exactly that. The table used to render `created_at`
 * on its own, so the same list read in the other view showed dates that ran out of order against
 * the ordering it was sorted in, and an advert republished months after Fredy found it was dated
 * by the scrape rather than by the portal.
 *
 * A source-level check rather than a rendered one: both views are Semi UI trees whose date is one
 * expression deep inside them, and what must not drift is that expression.
 */
const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf-8');

const DATE_EXPRESSION = 'timeService.format(item.published_at ?? item.created_at, false, locale)';

/** The field both views read, whichever way they print it. */
const DATE_FIELD = 'item.published_at ?? item.created_at';

describe('the listing date the table and the grid render', () => {
  it('is the same field in both views', () => {
    expect(read('../../ui/src/components/table/ListingsTable.jsx')).toContain(DATE_EXPRESSION);
    // The grid prints it as an age on the photo, with the exact date on hover.
    const grid = read('../../ui/src/components/grid/listings/ListingsGrid.jsx');
    expect(grid).toContain(`const listedAt = ${DATE_FIELD};`);
    expect(grid).toContain('relativeTime(listedAt, t)');
    expect(grid).toContain('timeService.format(listedAt, true, locale)');
  });

  it('is the field the list is sorted by out of the box', () => {
    expect(read('../../ui/src/components/listings/ListingsOverview.jsx')).toContain(
      `sort: { defaultValue: 'published_at'`,
    );
  });

  it('is never the scrape date alone', () => {
    for (const view of [
      '../../ui/src/components/table/ListingsTable.jsx',
      '../../ui/src/components/grid/listings/ListingsGrid.jsx',
    ]) {
      expect(read(view)).not.toContain('timeService.format(item.created_at');
    }
  });
});
