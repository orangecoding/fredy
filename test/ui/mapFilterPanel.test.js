/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';

/**
 * Same trick as `useControllableState.test.js`: a stubbed `useState` gives the panel's real logic
 * without a DOM renderer in a `node` test environment. The panel is called as the plain function it
 * is, and the element tree it returns is looked at directly - which is all a fold is: what the tree
 * holds before and after the heading is pressed.
 *
 * Semi's icon and badge are stubbed because their CommonJS builds require stylesheets, which Node
 * cannot load. Neither is called here; only the elements the panel creates for them are inspected.
 */
const hookState = vi.hoisted(() => ({ cells: [], cursor: 0 }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal()),
  useState: (initialValue) => {
    const index = hookState.cursor++;
    if (!(index in hookState.cells)) hookState.cells[index] = initialValue;
    return [
      hookState.cells[index],
      (next) => {
        hookState.cells[index] = typeof next === 'function' ? next(hookState.cells[index]) : next;
      },
    ];
  },
}));
vi.mock('@douyinfe/semi-icons', () => ({ IconChevronDown: function IconChevronDown() {} }));
vi.mock('@douyinfe/semi-ui-19', () => ({ Badge: function Badge() {} }));

const { default: MapFilterPanel } = await import('../../ui/src/views/listings/components/MapFilterPanel.jsx');

/**
 * Run the panel the way a render would, reusing whatever the previous run stored.
 *
 * @param {Object} props
 */
function render(props) {
  hookState.cursor = 0;
  return MapFilterPanel(props);
}

/**
 * Every element in the tree the predicate accepts, depth first.
 *
 * @param {*} node
 * @param {(element: Object) => boolean} predicate
 * @returns {Object[]}
 */
function findAll(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  if (node == null || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}

const hasClass = (name) => (element) =>
  String(element.props?.className ?? '')
    .split(' ')
    .includes(name);
const contains = (tree, element) => findAll(tree, (candidate) => candidate === element).length > 0;
const toggleOf = (tree) => findAll(tree, hasClass('map-panel__foldToggle'))[0];
const headingOf = (tree) => findAll(tree, hasClass('map-panel__groupTitle'))[0];

const filters = createElement('div', { className: 'filters-under-test' });
const expandButton = createElement('button', { className: 'map-shell__expand' });
const phone = { foldable: true, title: 'Map', headerExtra: expandButton, children: filters };

describe('MapFilterPanel', () => {
  beforeEach(() => {
    hookState.cells = [];
    hookState.cursor = 0;
  });

  describe('on a phone', () => {
    it('starts folded: the heading is a collapsed toggle and nothing below it is rendered', () => {
      const tree = render(phone);

      expect(hasClass('map-panel--folded')(tree)).toBe(true);
      expect(toggleOf(tree).props['aria-expanded']).toBe(false);
      expect(contains(tree, filters)).toBe(false);
    });

    it('keeps the fullscreen button in the heading row while folded', () => {
      expect(contains(headingOf(render(phone)), expandButton)).toBe(true);
    });

    it('opens on the heading and renders what it holds', () => {
      toggleOf(render(phone)).props.onClick();
      const tree = render(phone);

      expect(hasClass('map-panel--folded')(tree)).toBe(false);
      expect(toggleOf(tree).props['aria-expanded']).toBe(true);
      expect(contains(tree, filters)).toBe(true);
    });

    it('folds again on a second press', () => {
      toggleOf(render(phone)).props.onClick();
      toggleOf(render(phone)).props.onClick();

      expect(contains(render(phone), filters)).toBe(false);
    });

    it('shows how many filters are on while folded, and names it for a screen reader', () => {
      const tree = render({ ...phone, activeCount: 2, activeCountLabel: 'Active filters: 2' });
      const [badge] = findAll(tree, (element) => element.type?.name === 'Badge');

      expect(badge.props.count).toBe(2);
      expect(contains(toggleOf(tree), badge)).toBe(true);
      expect(toggleOf(tree).props['aria-label']).toBe('Map, Active filters: 2');
    });

    it('shows no count while open, where the filters speak for themselves', () => {
      const props = { ...phone, activeCount: 2, activeCountLabel: 'Active filters: 2' };
      toggleOf(render(props)).props.onClick();
      const tree = render(props);

      expect(findAll(tree, (element) => element.type?.name === 'Badge')).toEqual([]);
      expect(toggleOf(tree).props['aria-label']).toBeUndefined();
    });

    it('shows no count when no filter is on', () => {
      const tree = render({ ...phone, activeCount: 0, activeCountLabel: 'Active filters: 0' });

      expect(findAll(tree, (element) => element.type?.name === 'Badge')).toEqual([]);
      expect(toggleOf(tree).props['aria-label']).toBeUndefined();
    });
  });

  describe('wider than a phone', () => {
    const wide = { ...phone, foldable: false, activeCount: 2, activeCountLabel: 'Active filters: 2' };

    it('is always open, with a plain heading instead of a toggle', () => {
      const tree = render(wide);

      expect(toggleOf(tree)).toBeUndefined();
      expect(hasClass('map-panel--folded')(tree)).toBe(false);
      expect(contains(tree, filters)).toBe(true);
    });

    it('carries the title and the fullscreen button on its first heading', () => {
      const heading = headingOf(render(wide));

      expect(heading.props.children).toContain('Map');
      expect(contains(heading, expandButton)).toBe(true);
    });
  });
});
