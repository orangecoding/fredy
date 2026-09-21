/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { PLACEHOLDERS } from '../../lib/services/application/placeholders.js';
import { TEMPLATE_LANGUAGES } from '../../lib/services/application/templates/index.js';
import {
  PLACEHOLDER_CATALOG,
  PLACEHOLDER_GROUPS,
  LETTER_LANGUAGES,
} from '../../ui/src/services/application/placeholderCatalog.js';

/**
 * The frontend may not import out of `lib/`, so the placeholder catalogue exists twice: once where
 * the letters are rendered, once where the template editor offers them as chips. This suite is what
 * keeps the two honest - a placeholder added on the server and forgotten here would simply never be
 * offered, and one removed on the server would be offered and then reported as a typo.
 *
 * Only the catalogue is duplicated. Rendering stays on the server and the editor reaches it over
 * /api/user/settings/application-preview, for the same reason the finance maths does.
 */
describe('the application placeholder catalogue copy', () => {
  it('offers exactly the placeholders the server can fill', () => {
    expect(Object.keys(PLACEHOLDER_CATALOG).sort()).toEqual(Object.keys(PLACEHOLDERS).sort());
  });

  it('files every placeholder under the same group as the server', () => {
    for (const [key, definition] of Object.entries(PLACEHOLDERS)) {
      expect(PLACEHOLDER_CATALOG[key].group, key).toBe(definition.group);
    }
  });

  it('labels every placeholder with the same translation key as the server', () => {
    for (const [key, definition] of Object.entries(PLACEHOLDERS)) {
      expect(PLACEHOLDER_CATALOG[key].labelKey, key).toBe(definition.labelKey);
    }
  });

  it('lists every group the server files a placeholder under', () => {
    // The editor iterates PLACEHOLDER_GROUPS to lay its chips out, so a group added on the server
    // and missing here is a set of placeholders that is simply never offered - and nothing else
    // in this suite would notice, because the keys, groups and labels would all still agree.
    const onTheServer = [...new Set(Object.values(PLACEHOLDERS).map((definition) => definition.group))];
    expect([...PLACEHOLDER_GROUPS].sort()).toEqual(onTheServer.sort());
  });

  it('lists exactly the languages the server writes letters in', () => {
    expect([...LETTER_LANGUAGES].sort()).toEqual([...TEMPLATE_LANGUAGES].sort());
  });
});
