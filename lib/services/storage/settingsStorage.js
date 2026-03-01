/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { fromJson, readConfigFromStorage, toJson } from '../../utils.js';

// In-memory cache for compiled settings config
/** @type {Record<string, any>|null} */
let cachedSettingsConfig = null;

/**
 * Build a config object from DB rows of settings.
 * - Unwraps stored shape { value: any } into raw values.
 * - Add additional config values from file config. E.g. sqlite part cannot be stored in db for obvious reasons ;)
 * @param {{name:string, value:string|null}[]} rows
 * @param {{name:value}} configValues
 * @returns {Record<string, any>}
 */
function compileSettings(rows, configValues) {
  const config = {};
  for (const r of rows) {
    const parsed = fromJson(r.value, null);
    // unwrap { value: any } if present
    config[r.name] = parsed && typeof parsed === 'object' && 'value' in parsed ? parsed.value : parsed;
  }
  return {
    ...configValues,
    ...config,
  };
}

/**
 * Force reload the settings config cache from DB and return it.
 * @returns {Record<string, any>}
 */
export async function refreshSettingsCache() {
  const rows = SqliteConnection.query(`SELECT name, value FROM settings WHERE user_id IS NULL`);
  const configValues = await readConfigFromStorage();
  cachedSettingsConfig = compileSettings(rows, configValues);
  return cachedSettingsConfig;
}

/**
 * Retrieves user-specific settings from the database.
 * @param {string} userId
 * @returns {Record<string, any>}
 */
export function getUserSettings(userId) {
  if (!userId || typeof userId !== 'string') {
    return {};
  }
  const userRows = SqliteConnection.query(`SELECT name, value FROM settings WHERE user_id = @userId`, { userId });
  return compileSettings(userRows, {});
}

/**
 * Get the compiled settings config. Loads it once and caches the result.
 * @returns {Record<string, any>}
 */
export async function getSettings() {
  if (cachedSettingsConfig == null) {
    return refreshSettingsCache();
  }
  return cachedSettingsConfig;
}

/**
 * Upsert settings rows.
 * - Accepts an object map of name -> value, or an entry {name, value}.
 * - id: random string (nanoid) when inserting
 * - create_date: epoch ms when inserting
 * - name: unique key
 * - value: JSON string of the raw value (no wrapper)
 * @param {Record<string, any>|{name:string, value:any}|[string, any][]} settingsMapOrEntry
 * @returns {void}
 */
// Upsert one or more settings by name. Accepts either a single pair or an object map.
// Preferred usage: upsertSettings({ settingName: any, another: any })
export function upsertSettings(settingsMapOrEntry, userId = null) {
  const entries = Array.isArray(settingsMapOrEntry)
    ? settingsMapOrEntry
    : typeof settingsMapOrEntry === 'object' &&
        settingsMapOrEntry != null &&
        'name' in settingsMapOrEntry &&
        'value' in settingsMapOrEntry
      ? [[settingsMapOrEntry.name, settingsMapOrEntry.value]]
      : Object.entries(settingsMapOrEntry || {});

  for (const [name, rawValue] of entries) {
    if (rawValue === null) {
      SqliteConnection.execute(
        `DELETE FROM settings WHERE name = @name AND (user_id = @userId OR (user_id IS NULL AND @userId IS NULL))`,
        {
          name,
          userId,
        },
      );
    } else {
      const id = nanoid();
      const create_date = Date.now();
      const json = toJson(rawValue);
      SqliteConnection.execute(
        `INSERT INTO settings (id, create_date, name, value, user_id)
       VALUES (@id, @create_date, @name, @value, @userId)
       ON CONFLICT(name, IFNULL(user_id, 'GLOBAL_SETTING')) DO UPDATE SET value = excluded.value`,
        { id, create_date, name, value: json, userId },
      );
    }
  }
  // keep cache in sync (only for global settings)
  if (userId == null) {
    refreshSettingsCache();
  }
}
