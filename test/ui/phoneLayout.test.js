/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ADMIN_SETTINGS_PAGES, USER_SETTINGS_PAGES } from '../../ui/src/views/settings/settingsPages.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');

const app = read('ui/src/App.jsx');
const appLess = read('ui/src/App.less');
const indexHtml = read('index.html');
const settingsLayout = read('ui/src/views/settings/SettingsLayout.jsx');
const adminLayout = read('ui/src/views/admin/AdminLayout.jsx');
const settingsIndex = read('ui/src/views/settings/SettingsIndex.jsx');
const shell = read('ui/src/components/settingsShell/SettingsShell.jsx');
const shellLess = read('ui/src/components/settingsShell/SettingsShell.less');
const pageIcons = read('ui/src/views/settings/settingsPageIcons.js');
const indexLess = read('ui/src/Index.less');
const appBar = read('ui/src/components/navigation/MobileAppBar.jsx');
const tabBar = read('ui/src/components/navigation/MobileTabBar.jsx');
const menu = read('ui/src/components/navigation/MobileMenu.jsx');
const mobileLess = read('ui/src/components/navigation/MobileNav.less');
const toastLess = read('ui/src/components/version/UpdateToast.less');
const english = JSON.parse(read('ui/src/locales/en.json'));

/** The relative paths App.jsx declares under one of the two settings parents. */
function childRoutesOf(parent) {
  const start = app.indexOf(`path="${parent}"`);
  const end = app.indexOf('</Route>', start);
  return [...app.slice(start, end).matchAll(/path="([^"/][^"]*)"/g)].map((match) => `${parent}/${match[1]}`);
}

describe('settings pages', () => {
  it('names every settings route once, and nothing App.jsx has no route for', () => {
    const sorted = (pages) => pages.map((page) => page.path).sort();
    expect(sorted(USER_SETTINGS_PAGES)).toEqual(childRoutesOf('/settings').sort());
    // The users editor is part of the Users page, not a page of its own.
    const adminRoutes = childRoutesOf('/admin').filter((route) => !route.startsWith('/admin/users/'));
    expect(sorted(ADMIN_SETTINGS_PAGES)).toEqual(adminRoutes.sort());
  });

  it('translates every page name', () => {
    for (const page of [...USER_SETTINGS_PAGES, ...ADMIN_SETTINGS_PAGES]) {
      expect(english, page.path).toHaveProperty([page.labelKey]);
    }
  });

  it('builds the tab strips and the phone list from the same definitions', () => {
    expect(settingsLayout).toMatch(/USER_SETTINGS_PAGES\.map/);
    expect(adminLayout).toMatch(/ADMIN_SETTINGS_PAGES\.map/);
    expect(settingsIndex).toMatch(/USER_SETTINGS_PAGES\.map/);
    expect(settingsIndex).toMatch(/ADMIN_SETTINGS_PAGES\.map/);
    // A second copy of the paths in a layout is exactly what the module is there to prevent.
    expect(settingsLayout).not.toMatch(/'\/settings\/preferences'/);
    expect(adminLayout).not.toMatch(/'\/admin\/system'/);
  });

  it('draws an icon for every page, the same one in the column and in the phone list', () => {
    for (const page of [...USER_SETTINGS_PAGES, ...ADMIN_SETTINGS_PAGES]) {
      expect(pageIcons, page.icon).toMatch(new RegExp(`\\n  ${page.icon}: Icon\\w+,`));
    }
    expect(settingsIndex).toMatch(/SETTINGS_PAGE_ICONS\[page\.icon\]/);
    expect(settingsLayout).toMatch(/icon: SETTINGS_PAGE_ICONS\[page\.icon\]/);
    expect(adminLayout).toMatch(/icon: SETTINGS_PAGE_ICONS\[page\.icon\]/);
  });

  it('shows the list on a phone and keeps the redirect on a wide screen', () => {
    expect(app).toMatch(/phone \? <SettingsIndex \/> : <Navigate to="\/settings\/preferences" replace \/>/);
    expect(app).toMatch(/phone \? <SettingsIndex focus="instance" \/> : <Navigate to="\/admin\/system" replace \/>/);
  });

  it('lists the administration half to administrators only', () => {
    expect(settingsIndex).toMatch(/\{isAdmin && \(\s*<section\s+ref=\{instanceRef\}/);
  });

  it('replaces the column of pages with a breadcrumb on a phone', () => {
    expect(shell).toMatch(/\{!phone && \(\s*<nav className="settingsShell__subnav"/);
    expect(shell).toMatch(/\{phone && \(\s*<nav className="settingsShell__crumbs"/);
    expect(settingsLayout).toMatch(/crumbs=\{\[\{ path: '\/settings'/);
    expect(adminLayout).toMatch(/\{ path: '\/admin', label: t\('nav\.administration'\) \}/);
  });
});

describe('phone shell', () => {
  it('swaps the sidebar and the footer for the app bar and the tab bar', () => {
    expect(app).toMatch(/\{!phone && \(\s*<Sider>/);
    expect(app).toMatch(/\{phone && <MobileAppBar isAdmin=\{isAdmin\(\)\} \/>\}/);
    expect(app).toMatch(/\{phone \? <MobileTabBar isAdmin=\{isAdmin\(\)\} \/> : <FredyFooter \/>\}/);
  });

  it('keeps the page at the same place in the tree in both shells, so a rotation does not remount it', () => {
    // A ternary between two whole layouts would hand React two different parents for the content.
    expect(app).not.toMatch(/phone \? \(\s*<Layout/);
    expect(app).toMatch(/<Layout className=\{`app\$\{phone \? ' app--phone' : ''\}`\}>/);
  });

  it('sizes the app to the visible viewport and keeps clear of the notch and the home indicator', () => {
    expect(appLess).toMatch(/height: 100dvh;/);
    expect(indexHtml).toMatch(/viewport-fit=cover/);
    expect(mobileLess).toMatch(/padding: env\(safe-area-inset-top\)/);
    expect(mobileLess).toMatch(/padding: 0 @space-1 env\(safe-area-inset-bottom\);/);
  });

  it('publishes the tab bar height for whatever is fixed to the bottom edge', () => {
    expect(mobileLess).toMatch(
      /\.app--phone \{\s*--tabbar-height: calc\(@tabbar-height \+ env\(safe-area-inset-bottom\)\);/,
    );
    expect(toastLess).toMatch(/bottom: calc\(var\(--tabbar-height\) \+ @space-3\);/);
  });

  it('gives every control a touch target of at least 44px', () => {
    expect(mobileLess).toMatch(/@appbar-height: 56px;/);
    expect(mobileLess).toMatch(/@tabbar-height: 56px;/);
    expect(mobileLess).toMatch(/&__action \{[^}]*width: @control-lg;[^}]*height: @control-lg;/);
    expect(mobileLess).toMatch(/&__row \{[^}]*min-height: 48px;/);
  });

  it('marks the current tab like the sidebar does, without red', () => {
    expect(tabBar).toMatch(/resolveActiveKey\(tree, location\.pathname\)/);
    expect(tabBar).toMatch(/aria-current=\{isActive \? 'page' : undefined\}/);
    const active = mobileLess.match(/&--active \{\s*color: @color-text;[\s\S]*?\n {4}\}/);
    expect(active).not.toBeNull();
    expect(active[0]).toMatch(/@color-selected/);
    expect(active[0]).not.toMatch(/@color-accent|@color-error/);
  });

  it('keeps the onboarding tour targets on the phone', () => {
    expect(tabBar).toMatch(/data-tour=\{node\.key\}/);
    expect(menu).toMatch(/data-tour=\{node\.key\}/);
    expect(appBar).toMatch(/data-tour="\/settings"/);
    expect(appBar).toMatch(/data-tour="menu"/);
  });

  it('opens the menu over the page and closes it on Escape, on the mask and with the back button', () => {
    expect(menu).toMatch(/<SideSheet/);
    expect(menu).toMatch(/closeOnEsc/);
    expect(menu).toMatch(/onCancel=\{onClose\}/);
    // Kept in the history entry, so the browser's back button is a way to close it.
    expect(appBar).toMatch(/location\.state\?\.mobileMenu === true/);
    expect(appBar).toMatch(/navigate\(-1\)/);
    // The mask stays up while the sheet animates shut; a tap on it then must not step back a page.
    expect(appBar).toMatch(/const closeMenu = \(\) => \{\s*if \(!menuOpen\) \{\s*return;/);
    // A place chosen in the menu replaces the entry that opened it.
    expect(appBar).toMatch(/onNavigate=\{\(path\) => navigate\(path, \{ replace: true \}\)\}/);
  });

  it('carries over what the footer did: the version line and the update toast', () => {
    expect(menu).toMatch(/<VersionLine onShowNotes=\{onShowNotes\} \/>/);
    expect(appBar).toMatch(/<UpdateToast onShowNotes=\{showNotes\} \/>/);
    expect(appBar).toMatch(/<VersionModal/);
  });

  it('keeps the run status fresh from the app bar, as the sidebar does', () => {
    expect(appBar).toMatch(/useRunStatus\(\)/);
  });
});

describe('settings pages on a wide screen', () => {
  it('lists them in a column beside the page instead of a strip of tabs that wraps', () => {
    expect(shell).not.toMatch(/<Tabs|semi-ui/);
    expect(shellLess).toMatch(/&--split \{\s*display: grid;\s*grid-template-columns: @subnav-width minmax\(0, 1fr\);/);
    expect(shellLess).toMatch(/@subnav-width: 240px;/);
  });

  it('keeps the column in view while a long page scrolls', () => {
    expect(shellLess).toMatch(/&__subnav \{\s*position: sticky;\s*top: 0;/);
  });

  it('names the area and whose settings it holds at the top of the column, the page in the heading', () => {
    expect(settingsLayout).toMatch(/hint=\{t\('settings\.scopeUser'\)\}/);
    expect(adminLayout).toMatch(/hint=\{t\('settings\.indexInstanceScope'\)\}/);
    expect(shell).toMatch(/<Headline text=\{matched\?\.label \?\? title\} badge=\{badge\} \/>/);
  });

  it('marks the current page like the sidebar does, without red', () => {
    expect(shell).toMatch(/aria-current=\{isActive \? 'page' : undefined\}/);
    const active = shellLess.match(/&--active,\s*&--active:visited,\s*&--active:hover \{[\s\S]*?\n {4}\}/);
    expect(active).not.toBeNull();
    expect(active[0]).toMatch(/background: @color-selected;/);
    expect(active[0]).not.toMatch(/@color-accent|@color-error/);
  });

  it('still turns Debug red while capture is running', () => {
    expect(adminLayout).toMatch(/page\.path === '\/admin\/debug' && settings\?\.debug_logging_enabled/);
    expect(adminLayout).toMatch(/className="settingsShell__subnavAlert"/);
    expect(shellLess).toMatch(/&__subnavAlert \{[^}]*color: @color-error;/);
    // No tab strip carries a state icon any more, so the strips hide every icon.
    expect(indexLess).not.toMatch(/tabIcon--alert/);
  });

  it('loads the stylesheet of the field rows on every page that lays its fields out with them', () => {
    // SystemPage uses `adminRow` without the AdminField component, and relied on the bundler having
    // put AdminField.less into a chunk that was already loaded. Opened first, it was unstyled.
    for (const file of ['ui/src/views/admin/pages/SystemPage.jsx', 'ui/src/views/admin/pages/ExecutionPage.jsx']) {
      const source = read(file);
      expect(source, file).toMatch(/adminRow/);
      expect(source, file).toMatch(
        /import '\.\.\/components\/AdminField\.less';|import AdminField from '\.\.\/components\/AdminField\.jsx';/,
      );
    }
  });
});
