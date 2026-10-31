/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { compareVersions, newestVersion, selectUnseenRelease } from '../../ui/src/services/news/newsSelection.js';

/**
 * @param {string} version
 * @returns {Object} A release as `GET /api/version/releases` returns it.
 */
function release(version) {
  return { version, date: '2026-01-01T00:00:00Z', bodyHtml: `<p>Release ${version}</p>` };
}

// Newest first, the order the server sends.
const releases = [release('25.0.0'), release('24.0.0'), release('23.1.0')];

describe('comparing versions', () => {
  it.each([
    ['25.0.0', '24.0.0', 1],
    ['24.0.0', '25.0.0', -1],
    ['25.0.0', '25.0.0', 0],
    ['25.1.0', '25.0.9', 1],
    ['26.0.0', '25.99.99', 1],
  ])('puts %s %s', (left, right, expected) => {
    expect(Math.sign(compareVersions(left, right))).toBe(expected);
  });

  it('treats a release candidate as the release it is a candidate for', () => {
    // Somebody running 25.1.0-rc.1 has already seen what 25.1.0 contains.
    expect(compareVersions('25.1.0-rc.1', '25.1.0')).toBe(0);
  });

  it('copes with nonsense instead of throwing', () => {
    expect(compareVersions(undefined, null)).toBe(0);
    expect(compareVersions('not a version', '0.0.0')).toBe(0);
  });
});

describe('choosing which news to show', () => {
  it('shows the newest release to somebody who has not seen it', () => {
    expect(selectUnseenRelease(releases, '24.0.0')?.version).toBe('25.0.0');
  });

  it('shows only the newest one, even after skipping several', () => {
    // From 23 to 25: what 25 brought is the news. 24 is in the What's New sheet.
    expect(selectUnseenRelease(releases, '23.1.0')?.version).toBe('25.0.0');
  });

  it('shows nothing when the user is already caught up', () => {
    expect(selectUnseenRelease(releases, '25.0.0')).toBeNull();
  });

  it('shows nothing to somebody with no marker, because a new account has no backlog', () => {
    expect(selectUnseenRelease(releases, null)).toBeNull();
    expect(selectUnseenRelease(releases, '')).toBeNull();
    expect(selectUnseenRelease(releases, undefined)).toBeNull();
  });

  it('copes with no releases at all, which is what an unreachable GitHub looks like', () => {
    expect(selectUnseenRelease([], '1.0.0')).toBeNull();
    expect(selectUnseenRelease(undefined, '1.0.0')).toBeNull();
    expect(newestVersion([])).toBeNull();
    expect(newestVersion(undefined)).toBeNull();
  });

  it('takes the marker from the list rather than the running version', () => {
    expect(newestVersion(releases)).toBe('25.0.0');
  });
});
