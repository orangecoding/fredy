/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const overview = read('ui/src/components/listings/ListingsOverview.jsx');
const grid = read('ui/src/components/grid/listings/ListingsGrid.jsx');
const table = read('ui/src/components/table/ListingsTable.jsx');
const actions = read('ui/src/components/listings/ListingActions.jsx');
const watch = read('ui/src/components/listings/WatchToggle.jsx');
const scam = read('ui/src/components/listings/ScamBadge.jsx');

const gridLess = read('ui/src/components/grid/listings/ListingsGrid.less');
const tableLess = read('ui/src/components/table/ListingsTable.less');
const actionsLess = read('ui/src/components/listings/ListingActions.less');
const watchLess = read('ui/src/components/listings/WatchToggle.less');
const scamLess = read('ui/src/components/listings/ScamBadge.less');

/**
 * A source file with its comments taken out.
 *
 * Every "this must not appear" assertion in this suite is a statement about the code, and the files
 * it guards explain themselves on purpose: they name the `role="button"` that went, the
 * `@color-faint` the date used to be printed in, the `opacity: 0.6` that dimmed a whole row and the
 * `compact` shape that dropped the warning's word - each one next to what replaced it and why.
 * Matched against the raw text, those assertions fail a file for documenting its own history, and
 * the redesign these files come from forbids shortening the comments to please a regex. So the
 * prose comes out first and the assertion sees only what actually runs.
 *
 * Block comments go first, which also takes the bodies of JSX `{/* ... *\/}` comments with them;
 * the `//` pass is anchored to the start of a line, so it cannot eat the `//` of a URL.
 *
 * @param {string} text
 * @returns {string}
 */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('both views survive', () => {
  it('still offers the switch between them, and remembers it', () => {
    expect(overview).toMatch(/switchViewMode\('grid'\)/);
    expect(overview).toMatch(/switchViewMode\('table'\)/);
    expect(overview).toMatch(/viewMode === 'grid'/);
    expect(overview).toMatch(/<ListingsGrid/);
    expect(overview).toMatch(/<ListingsTable/);
    expect(overview).toMatch(/listings_view_mode/);
  });

  it('builds its actions once, not twice', () => {
    expect(grid).toMatch(/<ListingActions/);
    expect(table).toMatch(/<ListingActions/);
    expect(grid).toMatch(/<WatchToggle/);
    expect(table).toMatch(/<WatchToggle/);

    // Every icon that used to be a hand-built button in both views.
    for (const source of [code(grid), code(table)]) {
      for (const icon of ['IconDelete', 'IconRefresh', 'IconCopy', 'IconEyeOpened', 'IconStar', 'IconStarStroked']) {
        expect(source, icon).not.toMatch(new RegExp(icon));
      }
    }
  });

  it('hands both views the same props, so neither can lose an action', () => {
    for (const source of [grid, table]) {
      for (const prop of ['onApplication', 'onReactivate', 'onRestore', 'onDelete', 'isHiddenView']) {
        expect(source, prop).toMatch(new RegExp(`${prop}=`));
      }
    }
  });

  it('keeps delete behind the overflow menu rather than beside everything harmless', () => {
    expect(actions).toMatch(/Dropdown/);
    expect(actions).toMatch(/Dropdown\.Divider/);
    expect(actions).toMatch(/type="danger"/);
  });
});

describe('the card and the row are no longer buttons full of buttons', () => {
  it('carries no role or tabIndex on the container', () => {
    for (const source of [code(grid), code(table)]) {
      expect(source).not.toMatch(/role="button"/);
      expect(source).not.toMatch(/tabIndex=\{0\}/);
    }
  });

  it('makes the title a real link instead', () => {
    for (const source of [grid, table]) {
      expect(source).toMatch(/from 'react-router'/);
      expect(source).toMatch(/to=\{`\/listings\/listing\/\$\{item\.id\}`\}/);
      // And not in the hidden view, where onNavigate refuses to go anywhere.
      expect(source).toMatch(/isHiddenView \?/);
    }
  });

  it('stops the click in one place per view, not once per button', () => {
    for (const source of [code(grid), code(table)]) {
      // Card/row: the action area and the status control. Nothing else.
      expect([...source.matchAll(/stopPropagation/g)].length, 'call sites').toBeLessThanOrEqual(4);
    }
    expect(code(actions)).not.toMatch(/stopPropagation\(/);
    expect(code(watch)).not.toMatch(/stopPropagation/);
  });
});

describe('no styling in the markup', () => {
  it('spends no colour, no spacing and no cursor there', () => {
    for (const source of [code(grid), code(table), code(actions), code(watch), code(scam)]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/var\(--f-/);
      expect(source).not.toMatch(/var\(--semi-/);
      expect(source).not.toMatch(/style=\{\{/);
    }
  });

  it('keeps Semi’s palette out of the four badges', () => {
    for (const file of [
      'ui/src/components/listings/ScamBadge.less',
      'ui/src/components/listings/PriceChangeBadge.less',
      'ui/src/components/listings/PricePerSqmBadge.less',
      'ui/src/components/listings/AffordabilityChip.less',
    ]) {
      expect(code(read(file)), file).not.toMatch(/--semi-color-(danger|success)/);
    }
  });
});

describe('the table is a table', () => {
  it('has a header, and it uses the same columns as its rows', () => {
    expect(table).toMatch(/listingsTable__head/);
    expect(tableLess).toMatch(/@listing-columns:/);
    const head = tableLess.match(/&__head\s*\{[\s\S]*?\n {2}\}/);
    const row = tableLess.match(/&__row\s*\{[\s\S]*?\n {2}\}/);
    expect(head).not.toBeNull();
    expect(row).not.toBeNull();
    expect(head[0]).toMatch(/grid-template-columns:\s*@listing-columns;/);
    expect(row[0]).toMatch(/grid-template-columns:\s*@listing-columns;/);
  });

  it('gives the action column a fixed width, so the columns stop wandering', () => {
    // `auto` made the last column as wide as its content, and a row with one button more shifted
    // every other column of that row against every other row.
    expect(code(tableLess)).not.toMatch(/@listing-columns:[^;]*\bauto\b/);
    expect(tableLess).toMatch(/@listing-columns:[^;]*124px;/);
  });

  it('hides the same columns in the header as in the row', () => {
    for (const width of ['900px', '560px']) {
      expect([...tableLess.matchAll(new RegExp(`max-width: ${width}`, 'g')).map((m) => m[0])], width).toHaveLength(2);
    }
  });

  it('takes the status out of the action group', () => {
    expect(code(actions)).not.toMatch(/StatusControl/);
    expect(table).toMatch(/listingsTable__row__status/);
  });
});

describe('the warning keeps its word in both views', () => {
  it('has no shape that drops the label', () => {
    expect(code(scam)).not.toMatch(/compact/);
    expect(code(scamLess)).not.toMatch(/--compact/);
    expect(scamLess).toMatch(/&--inline/);
    expect(scamLess).toMatch(/&--onImage/);
  });

  it('lists its reasons rather than running them into one paragraph', () => {
    expect(code(scam)).not.toMatch(/\.join\(' '\)/);
    expect(scam).toMatch(/<ul>/);
  });
});

describe('spacing comes from the scale', () => {
  const SPACING =
    /^\s*(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left):\s*([^;]+);/gm;

  /**
   * Every spacing declaration whose value is not built from the scale.
   *
   * Source text rather than compiled CSS, on purpose: this guards the thing that is easy to break
   * by hand and invisible in a diff - somebody writing `padding: 10px` next to five declarations
   * that use tokens.
   *
   * @param {string} text
   * @returns {string[]}
   */
  function offenders(text) {
    const bad = [];
    for (const match of text.replace(/\s*!important/g, '').matchAll(SPACING)) {
      for (const part of match[2].trim().split(/\s+/)) {
        if (!/^(0|auto|@space-\d+)$/.test(part)) {
          bad.push(match[0].trim());
        }
      }
    }
    return bad;
  }

  it('uses nothing but 0, auto and @space-* in the five stylesheets of this page', () => {
    expect(offenders(gridLess)).toEqual([]);
    expect(offenders(tableLess)).toEqual([]);
    expect(offenders(actionsLess)).toEqual([]);
    expect(offenders(watchLess)).toEqual([]);
    expect(offenders(scamLess)).toEqual([]);
  });
});

describe('contrast', () => {
  it('no longer prints the date in the faint grey that measures 2,19 to 1', () => {
    for (const [name, text] of [
      ['grid', code(gridLess)],
      ['table', code(tableLess)],
    ]) {
      expect(text, name).not.toMatch(/@color-faint/);
    }
  });

  it('no longer dims a whole row below AA to say it is inactive', () => {
    expect(code(tableLess)).not.toMatch(/opacity:\s*0\.6/);
  });

  it('spends no colour on the price', () => {
    expect(code(gridLess)).not.toMatch(/&__amount\s*\{[^}]*@color-success/);
    expect(code(tableLess)).not.toMatch(/&__amount\s*\{[^}]*@color-success/);
  });
});
