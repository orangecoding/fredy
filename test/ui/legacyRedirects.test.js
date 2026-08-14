/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { LEGACY_REDIRECTS, resolveLegacyPath, targetPathname } from '../../ui/src/services/routes/legacyRedirects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '../../ui/src/App.jsx'), 'utf-8');

/**
 * Every path `App.jsx` declares a route for, children resolved against their parent.
 *
 * Read out of the source rather than listed here, because a list would be the thing that goes
 * stale: renaming a route in App.jsx has to break this test, not quietly agree with it.
 *
 * There are exactly two nested parents, `/settings` and `/admin`, and they are declared in that
 * order, so a relative path belongs to whichever of the two most recently opened above it.
 *
 * @returns {Set<string>}
 */
function declaredRoutes() {
  const settingsAt = appSource.indexOf('path="/settings"');
  const adminAt = appSource.indexOf('path="/admin"');
  const routes = new Set();

  for (const match of appSource.matchAll(/path="([^"]+)"/g)) {
    const value = match[1];
    if (value.startsWith('/')) {
      routes.add(value);
      continue;
    }
    const parent = match.index > adminAt ? '/admin' : '/settings';
    routes.add(`${parent}/${value}`);
  }

  // Guards the ordering assumption above: a relative path declared before either parent opens
  // would otherwise be filed under '/settings' without anyone noticing.
  if (settingsAt < 0 || adminAt < 0 || settingsAt > adminAt) {
    throw new Error('App.jsx no longer declares /settings before /admin; fix declaredRoutes()');
  }
  return routes;
}

describe('legacyRedirects', () => {
  const routes = declaredRoutes();

  it('reads the routes out of App.jsx rather than trusting a copy', () => {
    expect(routes.has('/admin')).toBe(true);
    expect(routes.has('/dashboard')).toBe(true);
    expect(routes.size).toBeGreaterThan(10);
  });

  it('resolves each nested child against the right parent', () => {
    // The two tab strips. Every tab is its own route, which is what makes it linkable.
    for (const tab of ['preferences', 'travel-time', 'listings', 'notifications']) {
      expect(routes.has(`/settings/${tab}`)).toBe(true);
    }
    for (const tab of ['system', 'execution', 'users', 'backup', 'debug']) {
      expect(routes.has(`/admin/${tab}`)).toBe(true);
    }
  });

  it.each(Object.entries(LEGACY_REDIRECTS))('sends %s to a route that exists', (_from, to) => {
    expect(to.startsWith('/')).toBe(true);
    expect(routes.has(targetPathname(to))).toBe(true);
  });

  it('never redirects to another redirect', () => {
    for (const to of Object.values(LEGACY_REDIRECTS)) {
      expect(LEGACY_REDIRECTS[targetPathname(to)]).toBeUndefined();
    }
  });

  it('keeps every address that has actually moved working', () => {
    for (const old of ['/generalSettings', '/userSettings', '/settings/addresses', '/users', '/users/new']) {
      expect(resolveLegacyPath(old)).not.toBeNull();
    }
  });

  it('does not shadow a route that still exists', () => {
    // A redirect declared for a live path would win over the page itself and make it unreachable.
    for (const from of Object.keys(LEGACY_REDIRECTS)) {
      expect(routes.has(from)).toBe(false);
    }
  });

  it('turns the watchlist page into the filter that replaced it', () => {
    expect(resolveLegacyPath('/listings/watchlist')).toBe('/listings?watch=true');
    expect(resolveLegacyPath('/watchlistManagement')).toBe('/listings?watch=true');
  });

  it('leaves the parameterised user edit URL to App.jsx', () => {
    // It cannot live in the table - the id has to be read and put back - so App.jsx keeps a small
    // component for it. If that ever goes, this is the test that notices.
    expect(resolveLegacyPath('/users/edit/:userId')).toBeNull();
    expect(appSource).toContain('LegacyUserEditRedirect');
    expect(routes.has('/users/edit/:userId')).toBe(true);
  });

  it('answers null for a path that was never moved', () => {
    expect(resolveLegacyPath('/dashboard')).toBeNull();
    expect(resolveLegacyPath('/nonsense')).toBeNull();
  });
});
