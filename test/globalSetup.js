/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ensureBinary } from 'cloakbrowser';

/**
 * Vitest global setup — runs once in the main process before any workers start.
 * Downloads the CloakBrowser stealth Chromium binary if it is not already
 * present. Without this, live test runs fail immediately with
 * "Failed to launch the browser process" before any test output appears.
 * Skipped in offline mode because the browser is fully mocked there.
 */
export async function setup() {
  if (process.env.TEST_MODE === 'offline') return;
  await ensureBinary();
}
