/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { getNotificationAdapters } from '../../lib/utils.js';

/**
 * Checks that need the adapters Fredy actually ships, loaded the way Fredy loads them.
 *
 * Deliberately its own file, with no mocking of any kind. This used to sit at the end of
 * `priceChangeFanout.test.js`, whose other cases replace `lib/utils.js` with an async `doMock`
 * factory; getting the real loader back meant `vi.resetModules()` followed by `vi.doUnmock()`, and
 * then seventeen concurrent dynamic imports through it. Sixteen of those adapters call
 * `readAdapterReadme()` at module scope, which reaches into `lib/utils.js` while it is being
 * imported - so whenever the reset raced the re-import, Vite's SSR transform threw
 * "Cannot access '__vite_ssr_import_2__' before initialization" from `markdown.js`. It passed
 * every time on its own and failed roughly one run in three under the full suite.
 *
 * A file that never mocks the module has nothing to undo, so there is no race to lose.
 */
describe('every shipped notification adapter', () => {
  it('implements sendPriceChange', async () => {
    const shipped = (await getNotificationAdapters()).filter((adapter) => adapter.config?.id != null);

    const missing = shipped
      .filter((adapter) => typeof adapter.sendPriceChange !== 'function')
      .map((adapter) => adapter.config.id);

    expect(missing).toEqual([]);
    expect(shipped.length).toBeGreaterThan(10);
  });
});
