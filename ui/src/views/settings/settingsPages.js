/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The pages of both settings areas, in order.
 *
 * One definition for the two places they are named: the tab strip on a wide screen (`SettingsLayout`,
 * `AdminLayout`) and the list a phone shows instead (`SettingsIndex`). Two copies would be two orders
 * and two sets of labels waiting to disagree.
 *
 * Labels are translation keys and icons are names, so the module stays free of React and can be
 * tested on its own. The components resolve both.
 *
 * @typedef {Object} SettingsPage
 * @property {string} path Route of the page.
 * @property {string} labelKey Translation key of its name.
 * @property {string} icon Name of its icon in the phone's list, see `SettingsIndex`.
 */

/**
 * Settings that belong to whoever is signed in.
 * @type {ReadonlyArray<Readonly<SettingsPage>>}
 */
export const USER_SETTINGS_PAGES = Object.freeze([
  { path: '/settings/preferences', labelKey: 'settings.tabPreferences', icon: 'preferences' },
  { path: '/settings/travel-time', labelKey: 'settings.tabTravelTime', icon: 'travelTime' },
  { path: '/settings/listings', labelKey: 'settings.tabListingDetails', icon: 'listingDetails' },
  { path: '/settings/application', labelKey: 'settings.tabApplication', icon: 'application' },
  { path: '/settings/notifications', labelKey: 'settings.tabNotifications', icon: 'notifications' },
  { path: '/settings/connections', labelKey: 'settings.tabConnections', icon: 'connections' },
  { path: '/settings/mcp-server', labelKey: 'settings.tabMcpServer', icon: 'mcpServer' },
]);

/**
 * Settings that belong to the instance. Administrators only.
 * @type {ReadonlyArray<Readonly<SettingsPage>>}
 */
export const ADMIN_SETTINGS_PAGES = Object.freeze([
  { path: '/admin/system', labelKey: 'admin.tabSystem', icon: 'system' },
  { path: '/admin/execution', labelKey: 'admin.tabExecution', icon: 'execution' },
  { path: '/admin/routing', labelKey: 'admin.tabRouting', icon: 'routing' },
  { path: '/admin/connectivity', labelKey: 'admin.tabConnectivity', icon: 'connectivity' },
  { path: '/admin/users', labelKey: 'admin.tabUsers', icon: 'users' },
  { path: '/admin/backup', labelKey: 'admin.tabBackup', icon: 'backup' },
  { path: '/admin/debug', labelKey: 'admin.tabDebug', icon: 'debug' },
]);
