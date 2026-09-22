/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  NAV_TREE,
  navTreeFor,
  routeKeysOf,
  resolveActiveKey,
  sectionScope,
  startsSection,
} from '../../ui/src/components/navigation/navModel.js';

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

  it('files every top-level entry under a section, and lets children inherit their parent', () => {
    for (const node of NAV_TREE) {
      expect(['work', 'personal', 'instance']).toContain(node.section);
      for (const child of node.children ?? []) {
        expect(child.section).toBeUndefined();
      }
    }
  });

  it('never puts a rule above the first entry, because there is nothing to divide it from', () => {
    expect(startsSection(navTreeFor(true), 0)).toBe(false);
    expect(startsSection(navTreeFor(false), 0)).toBe(false);
  });

  // The rule is a consequence of the sections rather than a position in the markup, which is what
  // keeps it in the right place for a user who cannot see administration at all.
  it('breaks above settings for a user without the admin bit', () => {
    const tree = navTreeFor(false);
    const breaks = tree.map((_node, index) => index).filter((index) => startsSection(tree, index));

    expect(breaks).toHaveLength(1);
    expect(tree[breaks[0]].key).toBe('/settings');
  });

  it('breaks above both settings and administration for an admin', () => {
    // Two, not one: they used to share a section, which is why the sidebar could not say that one
    // of them is yours alone and the other one is everybody's.
    const tree = navTreeFor(true);
    const breaks = tree.map((_node, index) => index).filter((index) => startsSection(tree, index));

    expect(breaks).toHaveLength(2);
    expect(breaks.map((index) => tree[index].key)).toEqual(['/settings', '/admin']);
  });

  it('names the two sections that need naming, and leaves the first one unnamed', () => {
    // The scope a ScopeBadge takes, not a translation key of its own: the sidebar says whose
    // settings these are with the same chip the two pages carry beside their heading.
    const tree = navTreeFor(true);
    expect(sectionScope(tree, 0)).toBeNull();
    expect(
      sectionScope(
        tree,
        tree.findIndex((node) => node.key === '/settings'),
      ),
    ).toBe('user');
    expect(
      sectionScope(
        tree,
        tree.findIndex((node) => node.key === '/admin'),
      ),
    ).toBe('instance');
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
