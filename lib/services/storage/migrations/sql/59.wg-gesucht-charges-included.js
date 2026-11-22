/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Mark the WG-Gesucht rents already stored as rents with the charges in them.
 *
 * The search list quotes the Gesamtmiete, and did before the October 2026 relaunch too, but the
 * provider stored it without saying so. A NULL basis reads as a Kaltmiete, so one job showed the
 * stored rents with estimated Nebenkosten on top and the new ones without, and the affordability
 * filter put them into different bands.
 *
 * `charges` stays NULL: the charges of these rows were never read, and a rent with charges that are
 * not stated separately is exactly what they are. A row that already states its basis keeps it.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(
    `UPDATE listings
     SET charges_included = 1
     WHERE provider = 'wgGesucht'
       AND charges_included IS NULL`,
  );
}
