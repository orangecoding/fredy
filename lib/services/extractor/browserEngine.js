/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which stealth Chromium Fredy drives on this machine.
 *
 * Clearcote's open build is the default. It needs no account or licence key and runs any number of
 * browsers at once, which Fredy relies on: a job run, the alive-checker, the price tracker and a
 * detail refetch each start their own. CloakBrowser stopped being an option for that with 0.7, which
 * makes every user claim a key by email and allows one browser at a time on a free one.
 *
 * Clearcote only builds its open browser for the platforms listed here. Everywhere else (Linux arm64
 * above all, which Fredy's Docker image is also built for) Fredy stays on CloakBrowser's last keyless
 * line, 0.6.x. The Dockerfile repeats this rule with `uname -m` when it pre-downloads the binary,
 * because `lib/` is not in the image yet at that point.
 */

/** `<platform>-<arch>` pairs Clearcote publishes an open build for. */
export const CLEARCOTE_PLATFORMS = new Set(['linux-x64', 'win32-x64', 'darwin-arm64']);

/**
 * Whether this machine drives Clearcote rather than CloakBrowser.
 *
 * @param {string} [platform] defaults to `process.platform`
 * @param {string} [arch] defaults to `process.arch`
 * @returns {boolean}
 */
export function usesClearcote(platform = process.platform, arch = process.arch) {
  return CLEARCOTE_PLATFORMS.has(`${platform}-${arch}`);
}

/**
 * Name of the browser engine this machine drives, for log lines.
 *
 * @returns {'Clearcote' | 'CloakBrowser'}
 */
export function browserEngineName() {
  return usesClearcote() ? 'Clearcote' : 'CloakBrowser';
}
