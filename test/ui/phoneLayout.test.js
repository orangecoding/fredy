/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { mobileMenuFor, mobileTabsFor, navTreeFor, routeKeysOf } from '../../ui/src/components/navigation/navModel.js';
import {
  ADMIN_SETTINGS,
  PERSONAL_SETTINGS,
  locateSettingsPage,
  settingsAreasFor,
} from '../../ui/src/components/settingsShell/settingsPages.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const english = JSON.parse(read('ui/src/locales/en.json'));
const app = read('ui/src/App.jsx');
const tabBar = read('ui/src/components/navigation/MobileTabBar.jsx');
const appBar = read('ui/src/components/navigation/MobileAppBar.jsx');
const menu = read('ui/src/components/navigation/MobileMenu.jsx');
const mobileLess = read('ui/src/components/navigation/MobileNav.less');
const index = read('ui/src/components/settingsShell/SettingsIndex.jsx');
const shell = read('ui/src/components/settingsShell/SettingsShell.jsx');
const settingsLayout = read('ui/src/views/settings/SettingsLayout.jsx');
const adminLayout = read('ui/src/views/admin/AdminLayout.jsx');

describe('phone tab bar', () => {
  it('carries the four places used every day, in sidebar order', () => {
    expect(routeKeysOf(mobileTabsFor(true))).toEqual(['/dashboard', '/jobs', '/listings', '/map']);
    expect(routeKeysOf(mobileTabsFor(false))).toEqual(['/dashboard', '/jobs', '/listings', '/map']);
  });

  it('leaves everything else to the menu, so no place is lost on a phone', () => {
    expect(routeKeysOf(mobileMenuFor(true))).toEqual(['/finance', '/settings', '/admin']);
    expect(routeKeysOf(mobileMenuFor(false))).toEqual(['/finance', '/settings']);
    for (const isAdmin of [true, false]) {
      const both = [...routeKeysOf(mobileTabsFor(isAdmin)), ...routeKeysOf(mobileMenuFor(isAdmin))];
      expect(both.sort()).toEqual(routeKeysOf(navTreeFor(isAdmin)).sort());
    }
  });

  it('marks the current tab the way the sidebar does, nested routes included', () => {
    expect(tabBar).toMatch(/resolveActiveKey\(tabs, location\.pathname\)/);
    expect(tabBar).toMatch(/aria-current=\{isActive \? 'page' : undefined\}/);
    const active = mobileLess.match(/&__tab--active \{[\s\S]*?\n {2}\}/);
    expect(active).not.toBeNull();
    expect(active[0]).toMatch(/background: @color-selected/);
    expect(active[0]).not.toMatch(/@color-accent/);
  });

  it('keeps the onboarding tour targets on the tabs and the settings button', () => {
    expect(tabBar).toMatch(/data-tour=\{node\.key\}/);
    expect(menu).toMatch(/data-tour=\{node\.key\}/);
    expect(appBar).toMatch(/data-tour="\/settings"/);
  });

  it('gives every control a 44px target and keeps clear of the notch and the home indicator', () => {
    expect(mobileLess).toMatch(/width: @control-lg;\s*height: @control-lg;/);
    expect(mobileLess).toMatch(/padding: 0 @space-2 env\(safe-area-inset-bottom\);/);
    expect(mobileLess).toMatch(/padding: env\(safe-area-inset-top\)/);
    // Safari's toolbar covers the bottom of a 100vh shell while it shows.
    expect(mobileLess).toMatch(/height: 100dvh;/);
  });
});

describe('phone shell', () => {
  it('keeps the page in the same place in the tree when the phone is turned', () => {
    // Crossing the breakpoint swaps the navigation around the page. Rendering two different trees
    // would remount the page and lose whatever had been typed into it.
    const shellFn = app.slice(app.indexOf('function AppShell'), app.indexOf('AppShell.displayName'));
    expect(shellFn).toMatch(/\{isPhone && <MobileAppBar[^>]*\/>\}\s*\{children\}/);
    expect(shellFn).toMatch(/\{!isPhone && \(\s*<Sider>/);
    expect(app.match(/<Content className="app__content">/g)).toHaveLength(1);
  });

  it('opens the menu over the page and closes it with the back button', () => {
    expect(menu).toMatch(/<SideSheet/);
    expect(menu).toMatch(/closeOnEsc/);
    // The open menu is a history entry: back closes it, an entry picked in it replaces it.
    expect(menu).toMatch(/navigate\(-1\)/);
    expect(menu).toMatch(/navigate\(to, \{ replace: isOpen \}\)/);
  });

  it('shows the update toast on a phone, where there is no footer to carry it', () => {
    expect(app).toMatch(/\{isPhone && <PhoneUpdateNotice \/>\}/);
    expect(read('ui/src/components/footer/FredyFooter.jsx')).toMatch(/hasUpdate && variant === 'bar' && <UpdateToast/);
  });
});

describe('settings pages', () => {
  it('lists the administration for admins only', () => {
    expect(settingsAreasFor(true).map((area) => area.scope)).toEqual(['user', 'instance']);
    expect(settingsAreasFor(false).map((area) => area.scope)).toEqual(['user']);
  });

  it('is the one definition the tab strips and the phone list are built from', () => {
    expect(settingsLayout).toMatch(/PERSONAL_SETTINGS\.pages\.map/);
    expect(adminLayout).toMatch(/ADMIN_SETTINGS\.pages\.map/);
    expect(index).toMatch(/settingsAreasFor\(isAdmin\)/);
    expect(settingsLayout).not.toMatch(/path: '\/settings\//);
    expect(adminLayout).not.toMatch(/path: '\/admin\//);
  });

  it('names every page with a key the app translates, and gives each an icon', () => {
    for (const area of [PERSONAL_SETTINGS, ADMIN_SETTINGS]) {
      expect(english[area.titleKey], area.titleKey).toBeTypeOf('string');
      for (const page of area.pages) {
        expect(english[page.labelKey], page.labelKey).toBeTypeOf('string');
        expect(index, page.icon).toMatch(new RegExp(`\\b${page.icon}: Icon\\w+`));
      }
    }
  });

  it('only lists pages the router has', () => {
    for (const area of [PERSONAL_SETTINGS, ADMIN_SETTINGS]) {
      for (const page of area.pages) {
        const segment = page.path.slice(area.root.length + 1);
        expect(app, page.path).toMatch(new RegExp(`<Route path="${segment}" `));
      }
    }
  });

  it('finds the page a path belongs to, longest prefix first', () => {
    expect(locateSettingsPage('/admin/users/edit/7')).toMatchObject({
      area: { scope: 'instance' },
      page: { path: '/admin/users' },
    });
    expect(locateSettingsPage('/settings/travel-time')).toMatchObject({ page: { path: '/settings/travel-time' } });
    expect(locateSettingsPage('/settings')).toMatchObject({ area: { scope: 'user' }, page: null });
    expect(locateSettingsPage('/admin')).toMatchObject({ area: { scope: 'instance' }, page: null });
    expect(locateSettingsPage('/settingsx')).toBeNull();
    expect(locateSettingsPage('/dashboard')).toBeNull();
  });

  it('shows the list on a phone and the first tab elsewhere', () => {
    expect(app).toMatch(/<Route index element=\{<SettingsIndexRoute scope="user" \/>\} \/>/);
    expect(app).toMatch(/<Route index element=\{<SettingsIndexRoute scope="instance" \/>\} \/>/);
    expect(index).toMatch(/if \(!isPhone\) \{\s*return <Navigate to=\{area\.pages\[0\]\.path\} replace \/>;/);
  });

  it('draws no tab strip on a phone, and a breadcrumb back instead', () => {
    expect(shell).toMatch(/\{!isPhone && \(\s*<Tabs/);
    expect(shell).toMatch(/settingsShell__crumbs/);
    // One tree for both widths: an early return on a phone remounted the page when it was turned.
    expect(shell).not.toMatch(/if \(isPhone\) \{\s*(\/\/[^\n]*\n\s*)*return/);
    expect(shell.match(/<Outlet /g)).toHaveLength(1);
    expect(adminLayout).toMatch(/trail=\{\[t\('settings\.title'\), t\('admin\.title'\)\]\}/);
    // The back arrow leads to the area's list: for an administration page that is /admin, rendered
    // by the same layout, so the administration's shared form survives the way back.
    expect(appBar).toMatch(/inSettings\?\.page != null \? inSettings\.area\.root : null/);
  });
});
