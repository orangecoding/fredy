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

const grid = read('ui/src/components/grid/jobs/JobGrid.jsx');
const table = read('ui/src/components/table/JobsTable.jsx');
const actions = read('ui/src/components/jobs/JobActions.jsx');
const gridLess = read('ui/src/components/grid/jobs/JobGrid.less');
const tableLess = read('ui/src/components/table/JobsTable.less');
const actionsLess = read('ui/src/components/jobs/JobActions.less');

describe('a card reads like a job on the dashboard', () => {
  it('names what the job searches and where it reports instead of counting them', () => {
    expect(grid).toMatch(/jobSetupLine\(job, providerNames\)/);
    expect(grid).not.toMatch(/jobs\.cardProviders|jobs\.cardChannels/);
  });

  it('keeps the one figure that says whether the job is working', () => {
    expect(grid).toMatch(/job\.numberOfFoundListings/);
    expect(grid).toMatch(/jobs\.cardListings/);
  });

  it('names the shared warning for a screen reader, not only in a hover', () => {
    for (const source of [grid, table]) {
      expect(source).toMatch(/role="img"[\s\S]{0,80}aria-label=/);
      expect(source).not.toMatch(/style=\{\{/);
    }
  });
});

describe('both views survive', () => {
  it('still offers the switch between them', () => {
    expect(grid).toMatch(/switchViewMode\('grid'\)/);
    expect(grid).toMatch(/switchViewMode\('table'\)/);
    expect(grid).toMatch(/viewMode === 'grid'/);
    expect(grid).toMatch(/<JobsTable/);
  });

  it('builds its actions once, not twice', () => {
    expect(grid).toMatch(/<JobActions/);
    expect(table).toMatch(/<JobActions/);
    for (const source of [grid, table]) {
      expect(source).not.toMatch(/IconDelete/);
      expect(source).not.toMatch(/IconDescend2/);
      expect(source).not.toMatch(/IconPlayCircle/);
    }
  });

  it('keeps the two deletes apart from everything harmless', () => {
    expect(actions).toMatch(/Dropdown/);
    expect(actions).toMatch(/Divider|divider/);
  });

  it('keeps deleting a shared job’s listings allowed', () => {
    // The menu item itself, from its opening tag to the call. Matching the first `onDeleteListings`
    // found the JSDoc instead, so the assertion could not fail.
    const item = actions.match(/<Dropdown\.Item(?:(?!<Dropdown\.Item)[\s\S])*?onDeleteListings\(/);
    expect(item).not.toBeNull();
    expect(item[0]).not.toMatch(/disabled/);
  });
});

describe('no colour literal in the markup', () => {
  it('has none in either view or in the shared actions', () => {
    for (const source of [grid, table, actions]) {
      expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/);
      expect(source).not.toMatch(/3f8f68/);
    }
  });
});

describe('stylesheets', () => {
  it('spends no colour on the three tiles', () => {
    expect(gridLess).not.toMatch(/@color-blue|@color-orange|@color-purple/);
    expect(gridLess).not.toMatch(/DashboardCardColors/);
    expect(tableLess).not.toMatch(/@color-blue|@color-orange|@color-purple/);
  });

  // The three stat tiles are gone (Exposé): the card carries one figure, the listings, with its unit
  // under it. What the old assertion protected - the label that says what the number means stays at
  // full muted contrast - is asserted on that label now.
  it('no longer dims the labels below AA', () => {
    expect(gridLess).not.toMatch(/&__statLabel|&__stats?\b/);
    const label = gridLess.match(/&__countLabel\s*\{[\s\S]*?\n {4}\}/);
    expect(label).not.toBeNull();
    expect(label[0]).not.toMatch(/opacity/);
    expect(label[0]).toMatch(/@color-muted/);
  });

  it('sets its figures in the UI face, never monospaced or in tabular figures', () => {
    for (const source of [gridLess, tableLess]) {
      expect(source).not.toMatch(/@font-mono/);
      expect(source).not.toMatch(/tabular-nums/);
    }
  });

  it('writes its column headings in sentence case', () => {
    expect(tableLess).not.toMatch(/text-transform:\s*uppercase/);
    expect(tableLess).not.toMatch(/letter-spacing/);
  });

  it('keeps the accent off the actions and the chosen view', () => {
    // The chosen view used to be a solid (red) button and the run icon was tinted green.
    expect(grid).not.toMatch(/theme=\{viewMode === '(grid|table)' \? 'solid'/);
    expect(grid).toMatch(/aria-pressed=\{viewMode === 'grid'\}/);
    expect(gridLess).toMatch(/&--on[\s\S]{0,80}color: @color-text/);
    expect(actionsLess).not.toMatch(/@color-accent|@color-success/);
  });

  it('draws a paused job as a ring and a quieter name, not a faded row', () => {
    expect(tableLess).not.toMatch(/opacity:/);
    expect(gridLess).toMatch(/&--paused &__name/);
  });

  it('gives the table a header that matches its rows', () => {
    expect(tableLess).toMatch(/&__head\s*\{[\s\S]*?grid-template-columns:\s*@job-columns/);
    expect(tableLess).toMatch(/&__row\s*\{[\s\S]*?grid-template-columns:\s*@job-columns/);
  });

  it('lays the cards out without floating columns', () => {
    expect(gridLess).toMatch(/repeat\(auto-fill, minmax\(~'min\(@\{job-card-min\}, 100%\)', 1fr\)\)/);
    expect(grid).not.toMatch(/<Row|<Col/);
  });
});
