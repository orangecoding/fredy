/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

export function up(db) {
  db.exec(`
    ALTER TABLE listings ADD COLUMN distances JSONB DEFAULT NULL;
    ALTER TABLE listings DROP COLUMN distance_to_destination;
  `);

  const rows = db.prepare("SELECT value, user_id FROM settings WHERE name = 'home_address'").all();

  const insert = db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, 'home_addresses', @value, @user_id)
     ON CONFLICT(name, IFNULL(user_id, 'GLOBAL_SETTING')) DO UPDATE SET value = excluded.value`,
  );

  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === 'object' && 'value' in parsed) {
      parsed = parsed.value;
    }
    if (!parsed || !parsed.coords) {
      continue;
    }
    insert.run({
      id: nanoid(),
      create_date: Date.now(),
      value: JSON.stringify([{ label: 'Home', address: parsed.address, coords: parsed.coords }]),
      user_id: row.user_id,
    });
  }

  db.prepare("DELETE FROM settings WHERE name = 'home_address'").run();
}
