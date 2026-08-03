/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  allReleases,
  compareVersions,
  newestVersion,
  selectUnseenReleases,
} from '../../ui/src/services/news/newsSelection.js';
import newsConfig from '../../ui/src/assets/news/news.json';

/**
 * @param {string} version
 * @returns {Object}
 */
function release(version) {
  return { version, date: '2026-01-01', entries: [{ title: `Release ${version}`, text: 'Something happened.' }] };
}

const config = { schemaVersion: 1, releases: [release('25.0.0'), release('24.0.0'), release('23.1.0')] };

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
  it('shows everything newer than the last one seen, oldest first', () => {
    const unseen = selectUnseenReleases(config, '23.1.0');
    expect(unseen.map((entry) => entry.version)).toEqual(['24.0.0', '25.0.0']);
  });

  it('shows nothing when the user is already caught up', () => {
    expect(selectUnseenReleases(config, '25.0.0')).toEqual([]);
  });

  it('shows nothing to somebody with no marker, because a new account has no backlog', () => {
    expect(selectUnseenReleases(config, null)).toEqual([]);
    expect(selectUnseenReleases(config, '')).toEqual([]);
    expect(selectUnseenReleases(config, undefined)).toEqual([]);
  });

  it('drops a malformed release rather than breaking the dialog', () => {
    const broken = {
      releases: [release('25.0.0'), { version: '24.0.0' }, { entries: [{ title: 'no version' }] }, null, 'nonsense'],
    };
    expect(allReleases(broken).map((entry) => entry.version)).toEqual(['25.0.0']);
  });

  it('drops an entry with no title but keeps the rest of its release', () => {
    const mixed = {
      releases: [{ version: '25.0.0', entries: [{ title: 'Good' }, { text: 'no title' }, null] }],
    };
    expect(allReleases(mixed)[0].entries).toHaveLength(1);
  });

  it('lists the whole history newest first, which is how the reopenable view reads', () => {
    expect(allReleases(config).map((entry) => entry.version)).toEqual(['25.0.0', '24.0.0', '23.1.0']);
  });

  it('copes with a file that has no releases at all', () => {
    expect(allReleases(null)).toEqual([]);
    expect(newestVersion({})).toBeNull();
    expect(selectUnseenReleases(undefined, '1.0.0')).toEqual([]);
  });

  it('takes the marker from the file rather than the running version', () => {
    // If it used package.json, adding an older release later would be swallowed silently.
    expect(newestVersion(config)).toBe('25.0.0');
  });
});

describe('the shipped news file', () => {
  it('is well formed, so nobody ships a release note that never appears', () => {
    const releases = allReleases(newsConfig);
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.length).toBe(newsConfig.releases.length);
  });

  it('lists its releases without duplicates', () => {
    const versions = newsConfig.releases.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
