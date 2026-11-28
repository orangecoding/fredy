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
 * @property {boolean} [mobileTab] On a phone the entry sits in the tab bar along the bottom edge
 *   instead of in the menu.
 */

/**
 * The sidebar, in order.
 *
 * Flat: every place is one click away and named once. The listings, the map and the financing
 * used to sit folded under a "Listings" group, which cost a click to reach two of the three pages
 * people use most and named the overview twice ("Listings", then "Overview"). The searches come
 * straight after the overview, because they are what everything below them is found by.
 *
 * Whose settings Settings and Administration are is said by the badge beside each page's heading,
 * not by the sidebar.
 *
 * Settings and Administration are single destinations rather than groups: each is one page that
 * carries its own sections, so a submenu here would name the same places twice - once in the
 * sidebar and again inside the page.
 *
 * On a phone the four places people open daily, mostly right after a notification, are the tab bar.
 * The financing is not among them: it is only of use while buying, so it goes into the menu with the
 * settings.
 *
 * @type {NavNode[]}
 */
export const NAV_TREE = [
  { key: '/dashboard', labelKey: 'nav.dashboard', section: 'work', mobileTab: true },
  { key: '/jobs', labelKey: 'nav.jobs', section: 'work', mobileTab: true },
  { key: '/listings', labelKey: 'nav.listings', section: 'work', mobileTab: true },
  { key: '/map', labelKey: 'nav.map', section: 'work', mobileTab: true },
  { key: '/finance', labelKey: 'nav.finance', section: 'work' },
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
 * The entries of the phone's tab bar, in order.
 *
 * @param {NavNode[]} tree The tree as the user sees it, see `navTreeFor`.
 * @returns {NavNode[]}
 */
export function mobileTabsOf(tree) {
  return tree.filter((node) => node.mobileTab === true);
}

/**
 * The entries of the phone's menu: everything the tab bar has no room for.
 *
 * @param {NavNode[]} tree The tree as the user sees it, see `navTreeFor`.
 * @returns {NavNode[]}
 */
export function mobileMenuOf(tree) {
  return tree.filter((node) => node.mobileTab !== true);
}

/**
 * The settings list a settings page belongs to, which is where the back arrow in the phone's app bar
 * leads. Null on the list itself and anywhere outside the settings.
 *
 * Administration pages go back to `/admin` rather than to `/settings`: both show the same list, but
 * only `/admin` keeps the administration layout mounted, and with it the one form its pages share.
 * Leaving a half-edited System page by the arrow must not drop the edit.
 *
 * @param {string} pathname
 * @returns {'/settings'|'/admin'|null}
 */
export function settingsListOf(pathname) {
  for (const root of ['/settings', '/admin']) {
    if (pathname.startsWith(root + '/') && pathname.length > root.length + 1) {
      return root;
    }
  }
  return null;
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
