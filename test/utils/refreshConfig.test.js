/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { refreshConfig } from '../../lib/utils.js';
import { DEFAULT_CONFIG } from '../../lib/defaultConfig.js';

/**
 * `refreshConfig()` decides what happens to an operator's configuration on every single start, so
 * both of its failure modes are expensive:
 *
 * - Not creating one when it is absent made every fresh Docker container unstartable (issue #389),
 *   because the image ships no conf/config.json and the first read threw ENOENT.
 * - Overwriting one it could not parse silently reset `sqlitepath` to the default, so Fredy came up
 *   against an empty database while the real one sat elsewhere - indistinguishable from data loss,
 *   with the config that pointed at it gone too.
 */
describe('refreshConfig', () => {
  let tempDir;
  let configPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fredy-refresh-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const readConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));

  it('creates a config with the defaults when none exists', async () => {
    const result = await refreshConfig(configPath);

    expect(fs.existsSync(configPath)).toBe(true);
    expect(readConfig()).toEqual(DEFAULT_CONFIG);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('creates the containing directory when it is missing too', async () => {
    const nested = path.join(tempDir, 'conf', 'config.json');
    await refreshConfig(nested);
    expect(JSON.parse(fs.readFileSync(nested, 'utf8'))).toEqual(DEFAULT_CONFIG);
  });

  // The scenario the operator cares about: they mounted their own file, it must come back untouched.
  it('leaves a config the operator brought exactly as it was', async () => {
    const brought = { sqlitepath: '/mnt/fredy-data', somethingCustom: 'keep me' };
    fs.writeFileSync(configPath, JSON.stringify(brought));

    const result = await refreshConfig(configPath);

    expect(readConfig()).toEqual(brought);
    expect(result).toEqual(brought);
  });

  it('backfills only the keys a older install is missing', async () => {
    fs.writeFileSync(configPath, JSON.stringify({ somethingCustom: 'keep me' }));

    await refreshConfig(configPath);

    expect(readConfig()).toEqual({ somethingCustom: 'keep me', ...DEFAULT_CONFIG });
  });

  describe('a config that cannot be read', () => {
    it('refuses to start rather than replacing it', async () => {
      fs.writeFileSync(configPath, '{"sqlitepath": "/mnt/fredy-data",');

      await expect(refreshConfig(configPath)).rejects.toThrow(/could not be read or parsed/);
    });

    // The important half of the assertion. Throwing is only useful if the file the operator has to
    // repair is still there to repair.
    it('leaves the unreadable file on disk untouched', async () => {
      const broken = '{"sqlitepath": "/mnt/fredy-data",';
      fs.writeFileSync(configPath, broken);

      await refreshConfig(configPath).catch(() => {});

      expect(fs.readFileSync(configPath, 'utf8')).toBe(broken);
    });

    it.each(['null', '[]', '"a string"', '42'])('rejects %s, which parses but is not a config', async (body) => {
      fs.writeFileSync(configPath, body);

      await expect(refreshConfig(configPath)).rejects.toThrow(/not a JSON object/);
      expect(fs.readFileSync(configPath, 'utf8')).toBe(body);
    });
  });
});
