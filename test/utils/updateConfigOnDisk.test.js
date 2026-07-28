/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { updateConfigOnDisk, configFilePath } from '../../lib/utils.js';

/**
 * conf/config.json used to be rewritten as `JSON.stringify({ sqlitepath })` whenever settings were
 * saved, which throws away every other key in the file. Harmless while the file holds one key, a
 * data-loss bug the moment a second one is added - and `refreshConfig()` treats an unreadable
 * config as "use the defaults", so a truncated write silently repoints the database.
 */
describe('updateConfigOnDisk', () => {
  let tempDir;
  let configPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fredy-config-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

  it('keeps keys the caller did not mention', () => {
    fs.writeFileSync(configPath, JSON.stringify({ sqlitepath: '/db', somethingElse: 'keep me', nested: { a: 1 } }));

    updateConfigOnDisk({ sqlitepath: '/other' }, configPath);

    expect(readConfig()).toEqual({ sqlitepath: '/other', somethingElse: 'keep me', nested: { a: 1 } });
  });

  it('adds a key that was not there before', () => {
    fs.writeFileSync(configPath, JSON.stringify({ sqlitepath: '/db' }));
    updateConfigOnDisk({ newKey: true }, configPath);
    expect(readConfig()).toEqual({ sqlitepath: '/db', newKey: true });
  });

  it('returns the merged config', () => {
    fs.writeFileSync(configPath, JSON.stringify({ sqlitepath: '/db', keep: 1 }));
    expect(updateConfigOnDisk({ sqlitepath: '/new' }, configPath)).toEqual({ sqlitepath: '/new', keep: 1 });
  });

  it('falls back to the defaults when the file is unreadable', () => {
    fs.writeFileSync(configPath, 'not json at all');
    updateConfigOnDisk({ somethingElse: 'x' }, configPath);
    // sqlitepath must survive from the defaults: dropping it entirely repoints the database.
    expect(readConfig()).toEqual({ sqlitepath: '/db', somethingElse: 'x' });
  });

  it('creates the file when it does not exist yet', () => {
    updateConfigOnDisk({ sqlitepath: '/fresh' }, configPath);
    expect(readConfig()).toEqual({ sqlitepath: '/fresh' });
  });

  it('leaves no temporary file behind', () => {
    fs.writeFileSync(configPath, JSON.stringify({ sqlitepath: '/db' }));
    updateConfigOnDisk({ sqlitepath: '/db2' }, configPath);
    expect(fs.readdirSync(tempDir)).toEqual(['config.json']);
  });

  it('writes readable, indented JSON', () => {
    fs.writeFileSync(configPath, JSON.stringify({ sqlitepath: '/db' }));
    updateConfigOnDisk({ sqlitepath: '/db' }, configPath);
    expect(fs.readFileSync(configPath, 'utf8')).toContain('\n  "sqlitepath"');
  });

  it('defaults to the real config file', () => {
    expect(configFilePath().endsWith(path.join('conf', 'config.json'))).toBe(true);
    expect(path.isAbsolute(configFilePath())).toBe(true);
  });
});
