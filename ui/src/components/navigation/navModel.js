/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The sidebar's structure, and the rule for deciding which entry the current URL belongs to.
 *
 * Kept out of the component because both are decisions rather than markup: which pages exist, who
 * may see them, and which of them a nested route like `/listings/listing/42` counts as. Those are
 * worth asserting on, and a component that renders Semi's `<Nav>` is not.
 *
 * Labels are carried as translation keys, not as translated strings. Resolving them needs a `t`
 * from React context, so it happens in the component; keeping the tree free of it is what lets this
 * module be tested without one.
 */

/**
 * One entry in the sidebar.
 *
 * A `key` beginning with `/` is a destination and navigates. Anything else is a group heading that
 * only opens its children - `parsePathName` and the click handler both rely on that distinction.
 *
 * @typedef {Object} NavNode
 * @property {string} key Route path, or a bare name for a group.
 * @property {string} labelKey Translation key for the visible label.
 * @property {NavNode[]} [children]
 * @property {boolean} [adminOnly] Hidden from users without the admin bit.
 */

/**
 * The sidebar, in order.
 *
 * Settings and Administration are single destinations rather than groups: each is one page that
 * carries its own sections, so a submenu here would name the same places twice - once in the
 * sidebar and again inside the page.
 *
 * @type {NavNode[]}
 */
export const NAV_TREE = [
  { key: '/dashboard', labelKey: 'nav.dashboard' },
  { key: '/jobs', labelKey: 'nav.jobs' },
  {
    key: 'listings',
    labelKey: 'nav.listings',
    children: [
      { key: '/listings', labelKey: 'nav.listingsOverview' },
      { key: '/map', labelKey: 'nav.mapView' },
      // Financing sits here rather than at the top level: it is a way of judging listings, not a
      // peer of the search itself.
      { key: '/finance', labelKey: 'nav.finance' },
    ],
  },
  { key: '/settings', labelKey: 'nav.settings' },
  { key: '/admin', labelKey: 'nav.administration', adminOnly: true },
];

/**
 * The tree as a given user sees it.
 *
 * @param {boolean} isAdmin
 * @returns {NavNode[]}
 */
export function navTreeFor(isAdmin) {
  return NAV_TREE.filter((node) => !node.adminOnly || isAdmin);
}

/**
 * Every destination in a tree, groups excluded.
 *
 * @param {NavNode[]} tree
 * @returns {string[]}
 */
export function routeKeysOf(tree) {
  const keys = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (typeof node.key === 'string' && node.key.startsWith('/')) {
        keys.push(node.key);
      }
      if (Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return keys;
}

/**
 * Which sidebar entry a path counts as.
 *
 * Longest prefix wins, so `/listings/listing/42` marks Overview and `/admin/users/edit/7` marks
 * Administration. A path under no entry at all - `/403`, say - falls back to its first segment,
 * which simply matches nothing and leaves the sidebar unselected rather than lighting up an
 * unrelated entry.
 *
 * @param {NavNode[]} tree
 * @param {string} pathname
 * @returns {string}
 */
export function resolveActiveKey(tree, pathname) {
  const longest = routeKeysOf(tree)
    .filter((key) => pathname === key || pathname.startsWith(key + '/'))
    .sort((a, b) => b.length - a.length)[0];

  if (longest != null) {
    return longest;
  }
  const [first] = pathname.split('/').filter((segment) => segment.length !== 0);
  return '/' + (first ?? '');
}
