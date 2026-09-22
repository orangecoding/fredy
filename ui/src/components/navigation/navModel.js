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
 * Which part of the sidebar an entry belongs to.
 *
 * Three rather than two. `config` used to hold both Settings and Administration, which is exactly
 * the distinction a reader needs and the one the sidebar never made: one of them is theirs alone
 * and the other one is everybody's.
 *
 * @typedef {'work'|'personal'|'instance'} NavSection
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
 * @property {NavSection} [section] Top-level entries only; children inherit their parent's.
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
  { key: '/dashboard', labelKey: 'nav.dashboard', section: 'work' },
  { key: '/jobs', labelKey: 'nav.jobs', section: 'work' },
  {
    key: 'listings',
    labelKey: 'nav.listings',
    section: 'work',
    children: [
      { key: '/listings', labelKey: 'nav.listingsOverview' },
      { key: '/map', labelKey: 'nav.mapView' },
      // Financing sits here rather than at the top level: it is a way of judging listings, not a
      // peer of the search itself.
      { key: '/finance', labelKey: 'nav.finance' },
    ],
  },
  { key: '/settings', labelKey: 'nav.settings', section: 'personal' },
  { key: '/admin', labelKey: 'nav.administration', section: 'instance', adminOnly: true },
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
 * True when a rule belongs above this entry, because it starts a different section than the one
 * before it. The first entry never gets one.
 *
 * @param {NavNode[]} tree
 * @param {number} index
 * @returns {boolean}
 */
export function startsSection(tree, index) {
  return index > 0 && tree[index].section !== tree[index - 1].section;
}

/**
 * Which scope a section belongs to, if it is one worth naming.
 *
 * `work` has none: it is the top of the list, and announcing a scope over the first three entries
 * would be naming the obvious. The other two exist precisely to be named - the rule between them
 * says that something changes, but not what.
 *
 * The value is the scope a `ScopeBadge` takes rather than a translation key of its own, so the
 * sidebar says whose settings these are with the same chip the two pages carry beside their
 * heading. Two spellings of one statement is how the sidebar and the page start disagreeing.
 *
 * @type {Readonly<Record<NavSection, 'user'|'instance'|null>>}
 */
const SECTION_SCOPES = Object.freeze({
  work: null,
  personal: 'user',
  instance: 'instance',
});

/**
 * The scope this entry announces, or null.
 *
 * Gated on `startsSection` because the entry that opens a section is the one the answer is about:
 * it is the first thing a reader meets after the rule, and it is where they are deciding whether
 * this is the half of the sidebar they want.
 *
 * @param {NavNode[]} tree
 * @param {number} index
 * @returns {'user'|'instance'|null}
 */
export function sectionScope(tree, index) {
  if (!startsSection(tree, index)) {
    return null;
  }
  return SECTION_SCOPES[tree[index].section] ?? null;
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
