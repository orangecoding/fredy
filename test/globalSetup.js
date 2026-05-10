/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ensureValidBinary } from '../lib/services/ensureValidBinary.js';

/**
 * Vitest global setup — runs once in the main process before any workers start.
 * Downloads and validates the CloakBrowser stealth Chromium binary.
 * ensureValidBinary() also removes and re-downloads partial/corrupt installations
 * so tests never fail with "Invalid file descriptor to ICU data received".
 * Skipped in offline mode because the browser is fully mocked there.
 */
export async function setup() {
  if (process.env.TEST_MODE === 'offline') return;
  await ensureValidBinary();
}
