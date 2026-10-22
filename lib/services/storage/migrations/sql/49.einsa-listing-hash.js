/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { createHash } from 'crypto';

/**
 * Rekeys the stored 1a Immobilien listings onto the hash the provider computes now.
 *
 * The provider's hash used to be built from the price label alone, because the advert id arrived as
 * a number and `buildHash` silently drops inputs without a length. It now covers the advert id and
 * the numeric price. Without this migration every advert already stored would look new on the next
 * run and be reported a second time.
 *
 * Both inputs are on the row: the id is the number in `/expose/<id>.html`, the price is the column.
 * The formula is copied rather than imported from `lib/utils.js`, because a migration has to keep
 * producing the hashes of the release it shipped with.
 *
 * A row whose new hash is already taken in its job is left on its old one (`UPDATE OR IGNORE`). That
 * happens when one advert was stored twice under labels that differed only in the monthly rate; the
 * older row takes the new hash, and the other one simply never matches a scrape again.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const rows = db
    .prepare(`SELECT id, link, price FROM listings WHERE provider = 'einsAImmobilien' ORDER BY created_at ASC`)
    .all();
  const rekey = db.prepare(`UPDATE OR IGNORE listings SET hash = ? WHERE id = ?`);
  for (const row of rows) {
    const advertId = /\/expose\/(\d+)\.html/.exec(row.link ?? '')?.[1];
    if (advertId == null) continue;
    const inputs = row.price == null ? [advertId] : [advertId, String(row.price)];
    rekey.run(createHash('sha256').update(inputs.join(',')).digest('hex'), row.id);
  }
}
