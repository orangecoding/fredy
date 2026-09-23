/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Puts the listings whose connectivity lookup came back without an answer back in the sweep's queue.
 *
 * Austria and Spain gained a coverage source in this release. Until now the sweep had nobody to ask
 * about a listing there, and stamped it with `connectivity = NULL` and the time - which the queue
 * reads as done for `connectivityMaxAgeDays`, 180 by default. Without this, every listing already
 * stored when the sources arrived would go on showing "no coverage data yet" for half a year while
 * new ones got an answer.
 *
 * Clearing the stamp is all it takes; the sweep's per-run limit works through the backlog. A listing
 * elsewhere whose lookup found nothing is asked once more and stamped again, which costs one request
 * each and changes nothing else.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`UPDATE listings SET connectivity_at = NULL WHERE connectivity IS NULL AND connectivity_at IS NOT NULL`);
}
