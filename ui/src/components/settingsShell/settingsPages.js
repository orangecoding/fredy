/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The pages of the two settings areas, in one place.
 *
 * Three things name them: the tab strip of each area on a wide screen, the list a phone shows instead
 * of that strip, and the phone's app bar, which needs to know which area a sub-page belongs to so its
 * back arrow can lead there. They used to be two arrays inside the two layouts; a page added to one
 * of them now shows up in all three.
 *
 * Labels are carried as translation keys, like the sidebar's tree, so this module can be tested
 * without React.
 */

/**
 * Whose settings an area holds. Same words as `ScopeBadge`'s `scope`.
 *
 * @typedef {'user'|'instance'} SettingsScope
 */

/**
 * One settings page.
 *
 * @typedef {Object} SettingsPage
 * @property {string} path Route of the page.
 * @property {string} labelKey Translation key of its name, the same one the tab shows.
 * @property {string} icon Name of the icon the phone's list draws in front of it (see `SettingsIndex`).
 */

/**
 * One of the two areas.
 *
 * @typedef {Object} SettingsArea
 * @property {SettingsScope} scope
 * @property {string} root The area's own route, `/settings` or `/admin`.
 * @property {string} titleKey Translation key of the area's name.
 * @property {boolean} adminOnly Hidden from users without the admin bit.
 * @property {SettingsPage[]} pages In the order the tabs show them.
 */

/** @type {SettingsArea} */
export const PERSONAL_SETTINGS = Object.freeze({
  scope: 'user',
  root: '/settings',
  titleKey: 'settings.title',
  adminOnly: false,
  pages: Object.freeze([
    { path: '/settings/preferences', labelKey: 'settings.tabPreferences', icon: 'preferences' },
    { path: '/settings/travel-time', labelKey: 'settings.tabTravelTime', icon: 'travelTime' },
    { path: '/settings/listings', labelKey: 'settings.tabListingDetails', icon: 'listingDetails' },
    { path: '/settings/application', labelKey: 'settings.tabApplication', icon: 'application' },
    { path: '/settings/notifications', labelKey: 'settings.tabNotifications', icon: 'notifications' },
    { path: '/settings/connections', labelKey: 'settings.tabConnections', icon: 'connections' },
    { path: '/settings/mcp-server', labelKey: 'settings.tabMcpServer', icon: 'mcpServer' },
  ]),
});

/** @type {SettingsArea} */
export const ADMIN_SETTINGS = Object.freeze({
  scope: 'instance',
  root: '/admin',
  titleKey: 'admin.title',
  adminOnly: true,
  pages: Object.freeze([
    { path: '/admin/system', labelKey: 'admin.tabSystem', icon: 'system' },
    { path: '/admin/execution', labelKey: 'admin.tabExecution', icon: 'execution' },
    { path: '/admin/routing', labelKey: 'admin.tabRouting', icon: 'routing' },
    { path: '/admin/connectivity', labelKey: 'admin.tabConnectivity', icon: 'connectivity' },
    { path: '/admin/users', labelKey: 'admin.tabUsers', icon: 'users' },
    { path: '/admin/backup', labelKey: 'admin.tabBackup', icon: 'backup' },
    { path: '/admin/debug', labelKey: 'admin.tabDebug', icon: 'debug' },
  ]),
});

/**
 * Both areas as one user sees them, personal first.
 *
 * @param {boolean} isAdmin
 * @returns {SettingsArea[]}
 */
export function settingsAreasFor(isAdmin) {
  return [PERSONAL_SETTINGS, ADMIN_SETTINGS].filter((area) => !area.adminOnly || isAdmin);
}

/**
 * Where a path sits among the settings: which area, and which page in it.
 *
 * Longest prefix wins, so `/admin/users/edit/7` is the Users page. The area's root alone - the list
 * on a phone, the redirect to the first tab elsewhere - is the area with no page.
 *
 * @param {string} pathname
 * @returns {{area: SettingsArea, page: SettingsPage|null}|null} `null` outside the settings.
 */
export function locateSettingsPage(pathname) {
  for (const area of [PERSONAL_SETTINGS, ADMIN_SETTINGS]) {
    if (pathname !== area.root && !pathname.startsWith(area.root + '/')) {
      continue;
    }
    const page =
      area.pages
        .filter((candidate) => pathname === candidate.path || pathname.startsWith(candidate.path + '/'))
        .sort((a, b) => b.path.length - a.path.length)[0] ?? null;
    return { area, page };
  }
  return null;
}
