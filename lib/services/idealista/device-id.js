/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The identity this installation shows to the idealista mobile api.
 *
 * The api wants a device id in every request and expects it to be as stable as the android id of
 * an install: minted once, kept for the life of the installation. Minting one per process makes
 * every restart a new install from the same address - many ids behind one api key, day after
 * day - which reads exactly like the scraping the api guards against.
 *
 * The id lives in the settings table, minted by the same get-or-create pattern as the session
 * secret. A caller that cannot reach the table (a test, a standalone tool) gets a process-lifetime
 * id instead, and the run simply looks like a fresh install.
 */

import { randomBytes } from 'crypto';
import { getSettings, upsertSettings } from '../storage/settingsStorage.js';

/** The settings row the id is stored under. */
const DEVICE_ID_SETTING = 'idealista_device_id';

/** What the api accepts: sixteen hex characters, the shape of an android id. */
const DEVICE_ID_SHAPE = /^[0-9a-f]{16}$/;

/**
 * The stable device id, minting and storing one on first use.
 *
 * @returns {Promise<string>} sixteen hex characters
 */
export async function idealistaDeviceId() {
  const settings = await getSettings();
  if (typeof settings[DEVICE_ID_SETTING] === 'string' && DEVICE_ID_SHAPE.test(settings[DEVICE_ID_SETTING])) {
    return settings[DEVICE_ID_SETTING];
  }

  const minted = randomBytes(8).toString('hex');
  upsertSettings({ [DEVICE_ID_SETTING]: minted });
  return minted;
}
