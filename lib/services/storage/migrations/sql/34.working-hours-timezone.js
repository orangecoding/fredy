/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../../logger.js';
import { getProcessTimeZone } from '../../../../utils.js';

/**
 * Pin existing working hours to the time zone they are currently being evaluated in.
 *
 * Working hours used to be read in whatever zone the Node process happened to run in, so the same
 * `10:00 - 16:00` meant different hours on a German server than in the Docker image, which sets no
 * `TZ` and therefore runs UTC. Moving an installation to another host silently moved its schedule
 * with it.
 *
 * Writing the process zone (rather than a fixed default) is what makes this upgrade a no-op for
 * every existing installation: the value recorded here is exactly the zone the previous code was
 * already using, so the effective window does not move. It only stops moving on its own from now
 * on. Operators who want different hours can pick a zone in the Execution settings.
 *
 * Configurations with no window set are left alone - there is nothing to pin, and writing a zone
 * would only put a value in front of an operator who never asked for one.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const tableExists = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings' LIMIT 1`)
    .get();
  if (!tableExists) return;

  const row = db.prepare(`SELECT id, value FROM settings WHERE name = 'workingHours' LIMIT 1`).get();
  if (row == null) return;

  let workingHours;
  try {
    workingHours = JSON.parse(row.value);
  } catch (err) {
    // A row that is not JSON is not something this migration can repair, and failing here would
    // block every later migration. The runtime treats an unreadable window as "not set" and runs.
    logger.error(`Could not read workingHours while migrating: ${err?.message || err}`);
    return;
  }

  if (workingHours == null || typeof workingHours !== 'object') return;
  if (typeof workingHours.timeZone === 'string' && workingHours.timeZone.length > 0) return;

  const isSet = (value) => typeof value === 'string' && value.length > 0;
  if (!isSet(workingHours.from) || !isSet(workingHours.to)) return;

  const migrated = JSON.stringify({ ...workingHours, timeZone: getProcessTimeZone() });
  db.prepare(`UPDATE settings SET value = @value WHERE id = @id`).run({ value: migrated, id: row.id });
}
