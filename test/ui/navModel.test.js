/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { NAV_TREE, navTreeFor, routeKeysOf, resolveActiveKey } from '../../ui/src/components/navigation/navModel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const english = JSON.parse(fs.readFileSync(path.join(here, '../../ui/src/locales/en.json'), 'utf-8'));

/**
 * Every label in a tree, groups included.
 * @param {import('../../ui/src/components/navigation/navModel.js').NavNode[]} nodes
 * @returns {string[]}
 */
function labelKeysOf(nodes) {
  return nodes.flatMap((node) => [node.labelKey, ...labelKeysOf(node.children ?? [])]);
}

describe('navModel', () => {
  it('hides administration from users without the admin bit', () => {
    expect(routeKeysOf(navTreeFor(false))).not.toContain('/admin');
    expect(routeKeysOf(navTreeFor(true))).toContain('/admin');
  });

  it('offers seven destinations to an admin and six to everyone else', () => {
    expect(routeKeysOf(navTreeFor(true))).toEqual([
      '/dashboard',
      '/jobs',
      '/listings',
      '/map',
      '/finance',
      '/settings',
      '/admin',
    ]);
    expect(routeKeysOf(navTreeFor(false))).toHaveLength(6);
  });

  it('translates every label it shows', () => {
    for (const key of labelKeysOf(NAV_TREE)) {
      expect(Object.keys(english)).toContain(key);
    }
  });

  it.each([
    ['/dashboard', '/dashboard'],
    ['/jobs', '/jobs'],
    // A nested route still marks the entry it belongs to, rather than leaving the sidebar blank
    // while the user is on it.
    ['/jobs/new', '/jobs'],
    ['/jobs/edit/abc-123', '/jobs'],
    ['/listings', '/listings'],
    ['/listings/listing/42', '/listings'],
    ['/map', '/map'],
    ['/finance', '/finance'],
    ['/settings', '/settings'],
    ['/admin', '/admin'],
    ['/admin/settings', '/admin'],
    ['/admin/users/edit/7', '/admin'],
    ['/admin/maintenance', '/admin'],
  ])('marks %s as %s', (pathname, expected) => {
    expect(resolveActiveKey(navTreeFor(true), pathname)).toBe(expected);
  });

  it('leaves the sidebar unselected on a path that belongs to no entry', () => {
    const active = resolveActiveKey(navTreeFor(true), '/403');
    expect(routeKeysOf(navTreeFor(true))).not.toContain(active);
  });

  it('does not light up administration for a user who cannot see it', () => {
    const tree = navTreeFor(false);
    expect(routeKeysOf(tree)).not.toContain(resolveActiveKey(tree, '/admin/settings'));
  });

  it('prefers the longest match, so a listing does not resolve to a shorter sibling', () => {
    // '/listings' is a prefix of nothing else in the tree today, but the sort is what keeps that
    // true when a '/listings/something' entry is added back.
    const tree = [
      { key: '/listings', labelKey: 'a' },
      { key: '/listings/saved', labelKey: 'b' },
    ];
    expect(resolveActiveKey(tree, '/listings/saved')).toBe('/listings/saved');
    expect(resolveActiveKey(tree, '/listings/listing/1')).toBe('/listings');
  });
});
