/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const localeDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src/locales');

/**
 * Reads a locale file and returns its translations without the _meta block.
 * @param {string} file - file name inside ui/src/locales
 * @returns {Record<string, string>}
 */
function readLocale(file) {
  const translations = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf-8'));
  delete translations._meta;
  return translations;
}

const localeFiles = fs.readdirSync(localeDir).filter((file) => file.endsWith('.json'));
const english = readLocale('en.json');

describe('locales', () => {
  it('ships english as the fallback language', () => {
    expect(localeFiles).toContain('en.json');
  });

  it.each(localeFiles.filter((file) => file !== 'en.json'))('%s defines the same keys as en.json', (file) => {
    const translations = readLocale(file);
    expect(Object.keys(translations).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(localeFiles)('%s has no empty translations', (file) => {
    const empty = Object.entries(readLocale(file))
      .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('translates every key the login screen uses', () => {
    const login = fs.readFileSync(path.join(localeDir, '../views/login/Login.jsx'), 'utf-8');
    const usedKeys = [...login.matchAll(/t\('([^']+)'\)/g)].map((match) => match[1]);

    expect(usedKeys.length).toBeGreaterThan(0);
    for (const key of usedKeys) {
      expect(Object.keys(english)).toContain(key);
    }
  });
});
