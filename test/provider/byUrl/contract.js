/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

/**
 * Shared by the `fetchListingByUrl` suites in this folder (#492, adding a listing by URL).
 *
 * They run against the recorded exposés in `test/testFixtures/` whatever TEST_MODE says: the point
 * is the parsing, and live pages change under a test. Every provider's answer is checked for two
 * things:
 *
 * - It is complete (id, link, title, and the figures the page states), never half-filled.
 * - It is the listing a search run would have stored, link and hash alike, which is what lets a later
 *   run of the job recognise it instead of storing the advert a second time.
 */

const FIXTURES = path.resolve('test/testFixtures');

/**
 * A recorded page or API answer, as text.
 *
 * @param {string} name File name in `test/testFixtures/`.
 * @returns {string}
 */
export const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/**
 * The contract every provider's answer has to meet.
 *
 * @param {any} listing What `fetchListingByUrl` resolved to.
 */
export function expectComplete(listing) {
  expect(listing).not.toBeNull();
  for (const key of ['id', 'link', 'title']) {
    expect(typeof listing[key]).toBe('string');
    expect(listing[key].trim().length).toBeGreaterThan(0);
  }
  expect(() => new URL(listing.link)).not.toThrow();
}
