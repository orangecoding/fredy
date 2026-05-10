/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ensureBinary } from 'cloakbrowser';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Resource files that must exist alongside the `chrome` binary for it to start.
 * `icudtl.dat` is the Unicode data file Chrome cannot run without; `resources.pak`
 * holds UI resources. Their absence indicates a partial/corrupt extraction.
 */
const REQUIRED_RESOURCE_FILES = ['icudtl.dat', 'resources.pak'];

/**
 * Return true when every required resource file exists next to the binary.
 *
 * @param {string} binaryPath - Absolute path to the `chrome` executable.
 * @returns {boolean}
 */
function isBinaryComplete(binaryPath) {
  const dir = path.dirname(binaryPath);
  return REQUIRED_RESOURCE_FILES.every((f) => fs.existsSync(path.join(dir, f)));
}

/**
 * Remove a corrupt binary directory and all `latest_version*` markers from the
 * CloakBrowser cache so the next `ensureBinary()` call falls back to the
 * package-bundled version.
 *
 * @param {string} binaryPath - Path to the (corrupt) `chrome` binary.
 */
function removeCorruptInstallation(binaryPath) {
  const binaryDir = path.dirname(binaryPath);
  const cacheDir = process.env.CLOAKBROWSER_CACHE_DIR || path.join(os.homedir(), '.cloakbrowser');

  fs.rmSync(binaryDir, { recursive: true, force: true });

  // Remove every version marker; they may all point to the now-deleted directory.
  try {
    for (const entry of fs.readdirSync(cacheDir)) {
      if (entry.startsWith('latest_version')) {
        fs.rmSync(path.join(cacheDir, entry), { force: true });
      }
    }
  } catch {
    // Cache dir may not exist if binaryDir was the only thing there — ignore.
  }
}

/**
 * Ensure the CloakBrowser stealth Chromium binary is present **and** complete.
 *
 * `cloakbrowser`'s own `ensureBinary()` only checks that the `chrome` file
 * exists.  An incomplete extraction (e.g. interrupted download, disk full) can
 * leave a directory that contains the executable but is missing `icudtl.dat`
 * and other resource files.  Chrome then crashes immediately on launch with
 * "Invalid file descriptor to ICU data received".
 *
 * This wrapper validates the path returned by `ensureBinary()`.  If resource
 * files are missing it removes the corrupt installation, clears the version
 * marker files, and calls `ensureBinary()` again so it falls back to (or
 * re-downloads) a complete build.
 *
 * The validated path is also pinned via `CLOAKBROWSER_BINARY_PATH` so that
 * CloakBrowser's own internal `ensureBinary()` call inside `launch()` always
 * picks up the same, verified binary.
 *
 * @returns {Promise<string>} Absolute path to the validated `chrome` binary.
 * @throws {Error} When even the fallback binary is incomplete.
 */
export async function ensureValidBinary() {
  const binaryPath = await ensureBinary();

  if (isBinaryComplete(binaryPath)) {
    process.env.CLOAKBROWSER_BINARY_PATH = binaryPath;
    return binaryPath;
  }

  const missing = REQUIRED_RESOURCE_FILES.filter((f) => !fs.existsSync(path.join(path.dirname(binaryPath), f)));
  console.warn(
    `[fredy] CloakBrowser installation at ${path.dirname(binaryPath)} is missing: ${missing.join(', ')}. Removing and retrying.`,
  );

  removeCorruptInstallation(binaryPath);

  const fallbackPath = await ensureBinary();
  if (!isBinaryComplete(fallbackPath)) {
    const stillMissing = REQUIRED_RESOURCE_FILES.filter(
      (f) => !fs.existsSync(path.join(path.dirname(fallbackPath), f)),
    );
    throw new Error(
      `CloakBrowser binary at ${path.dirname(fallbackPath)} is still missing required files after re-download: ${stillMissing.join(', ')}`,
    );
  }

  process.env.CLOAKBROWSER_BINARY_PATH = fallbackPath;
  return fallbackPath;
}
