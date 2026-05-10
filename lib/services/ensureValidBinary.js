/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ensureBinary } from 'cloakbrowser';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Resource files required on Linux/Windows — they must live next to the chrome binary.
 * macOS packages these inside the .app bundle's Frameworks directory so a different
 * check is used there (see isBinaryComplete).
 */
const LINUX_WIN_REQUIRED_FILES = ['icudtl.dat', 'resources.pak'];

/**
 * Return the top-level versioned installation directory for any platform.
 *
 * - Linux/Windows: binaryPath is   ~/.cloakbrowser/chromium-X.Y.Z/chrome
 *                  → dirname        ~/.cloakbrowser/chromium-X.Y.Z/
 * - macOS:         binaryPath is   ~/.cloakbrowser/chromium-X.Y.Z/Chromium.app/Contents/MacOS/Chromium
 *                  → 4 levels up    ~/.cloakbrowser/chromium-X.Y.Z/
 *
 * @param {string} binaryPath
 * @returns {string}
 */
function getVersionedDir(binaryPath) {
  if (process.platform === 'darwin') {
    return path.resolve(path.dirname(binaryPath), '../../..');
  }
  return path.dirname(binaryPath);
}

/**
 * Return true when the binary at binaryPath belongs to a complete installation.
 *
 * On macOS the binary lives inside an .app bundle:
 *   Chromium.app/Contents/MacOS/Chromium
 * Resource files (icudtl.dat etc.) are deep inside
 *   Chromium.app/Contents/Frameworks/…
 * so checking for them next to the binary is wrong. Instead we verify the two
 * structural markers that are only present after a full extraction: Info.plist
 * and the Frameworks directory inside Contents/.
 *
 * On Linux/Windows the binary and all resource files are siblings in the same
 * directory.
 *
 * @param {string} binaryPath
 * @returns {boolean}
 */
function isBinaryComplete(binaryPath) {
  if (process.platform === 'darwin') {
    const contentsDir = path.resolve(path.dirname(binaryPath), '..');
    return fs.existsSync(path.join(contentsDir, 'Info.plist')) && fs.existsSync(path.join(contentsDir, 'Frameworks'));
  }
  const dir = path.dirname(binaryPath);
  return LINUX_WIN_REQUIRED_FILES.every((f) => fs.existsSync(path.join(dir, f)));
}

/**
 * Return a human-readable description of which required files/dirs are missing.
 *
 * @param {string} binaryPath
 * @returns {string}
 */
function missingDescription(binaryPath) {
  if (process.platform === 'darwin') {
    const contentsDir = path.resolve(path.dirname(binaryPath), '..');
    return ['Info.plist', 'Frameworks'].filter((f) => !fs.existsSync(path.join(contentsDir, f))).join(', ');
  }
  const dir = path.dirname(binaryPath);
  return LINUX_WIN_REQUIRED_FILES.filter((f) => !fs.existsSync(path.join(dir, f))).join(', ');
}

/**
 * Remove a corrupt binary installation and all `latest_version*` markers from
 * the CloakBrowser cache so the next `ensureBinary()` call falls back to the
 * package-bundled version.
 *
 * Removes the full versioned directory (e.g. chromium-X.Y.Z/) on all platforms,
 * not just the subdirectory that contains the binary.
 *
 * @param {string} binaryPath - Path to the (corrupt) chrome/Chromium binary.
 */
function removeCorruptInstallation(binaryPath) {
  const versionedDir = getVersionedDir(binaryPath);
  const cacheDir = process.env.CLOAKBROWSER_CACHE_DIR || path.join(os.homedir(), '.cloakbrowser');

  fs.rmSync(versionedDir, { recursive: true, force: true });

  try {
    for (const entry of fs.readdirSync(cacheDir)) {
      if (entry.startsWith('latest_version')) {
        fs.rmSync(path.join(cacheDir, entry), { force: true });
      }
    }
  } catch {
    // Cache dir may not exist if versionedDir was the only entry — ignore.
  }
}

/**
 * Ensure the CloakBrowser stealth Chromium binary is present **and** complete.
 *
 * `cloakbrowser`'s own `ensureBinary()` only checks that the chrome/Chromium
 * file exists. An incomplete extraction (e.g. interrupted download, disk full)
 * can leave a directory that contains the executable but is missing essential
 * resource files. Chrome then crashes immediately on launch.
 *
 * This wrapper validates the path returned by `ensureBinary()`. If the
 * installation is incomplete it removes the corrupt directory, clears the
 * version marker files, and calls `ensureBinary()` again so it falls back to
 * (or re-downloads) a complete build.
 *
 * The validated path is also pinned via `CLOAKBROWSER_BINARY_PATH` so that
 * CloakBrowser's own internal `ensureBinary()` call inside `launch()` always
 * picks up the same, verified binary.
 *
 * @returns {Promise<string>} Absolute path to the validated binary.
 * @throws {Error} When even the fallback binary is incomplete.
 */
export async function ensureValidBinary() {
  const binaryPath = await ensureBinary();

  if (isBinaryComplete(binaryPath)) {
    process.env.CLOAKBROWSER_BINARY_PATH = binaryPath;
    return binaryPath;
  }

  console.warn(
    `[fredy] CloakBrowser installation at ${getVersionedDir(binaryPath)} is missing: ${missingDescription(binaryPath)}. Removing and retrying.`,
  );

  removeCorruptInstallation(binaryPath);

  const fallbackPath = await ensureBinary();
  if (!isBinaryComplete(fallbackPath)) {
    throw new Error(
      `CloakBrowser binary at ${getVersionedDir(fallbackPath)} is still missing required files after re-download: ${missingDescription(fallbackPath)}`,
    );
  }

  process.env.CLOAKBROWSER_BINARY_PATH = fallbackPath;
  return fallbackPath;
}
