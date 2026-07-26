/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { clearFixtures } from '../../tools/testFixtures/downloadFixtures.js';

describe('clearFixtures', () => {
  let fixturesDir;

  beforeEach(async () => {
    fixturesDir = await mkdtemp(path.join(tmpdir(), 'fredy-fixtures-'));
  });

  afterEach(async () => {
    await rm(fixturesDir, { recursive: true, force: true });
  });

  it('deletes all fixture files and reports how many were removed', async () => {
    await writeFile(path.join(fixturesDir, 'immowelt.html'), '<html></html>', 'utf-8');
    await writeFile(path.join(fixturesDir, 'immowelt_detail.html'), '<html></html>', 'utf-8');
    await writeFile(path.join(fixturesDir, 'immoscout_list.json'), '{}', 'utf-8');

    const deleted = await clearFixtures(fixturesDir);

    expect(deleted).toBe(3);
    expect(await readdir(fixturesDir)).toEqual([]);
  });

  it('keeps sub directories untouched', async () => {
    await mkdir(path.join(fixturesDir, 'nested'));
    await writeFile(path.join(fixturesDir, 'nested', 'keep.html'), '<html></html>', 'utf-8');
    await writeFile(path.join(fixturesDir, 'immowelt.html'), '<html></html>', 'utf-8');

    const deleted = await clearFixtures(fixturesDir);

    expect(deleted).toBe(1);
    expect(await readdir(fixturesDir)).toEqual(['nested']);
  });

  it('keeps dot files so the directory stays tracked in git', async () => {
    await writeFile(path.join(fixturesDir, '.gitkeep'), '', 'utf-8');
    await writeFile(path.join(fixturesDir, 'immowelt.html'), '<html></html>', 'utf-8');

    const deleted = await clearFixtures(fixturesDir);

    expect(deleted).toBe(1);
    expect(await readdir(fixturesDir)).toEqual(['.gitkeep']);
  });

  it('handles an already empty directory', async () => {
    expect(await clearFixtures(fixturesDir)).toBe(0);
  });
});
