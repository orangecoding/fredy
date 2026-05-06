/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import { guessBaseUrl } from '../../../../utils/detectBaseUrl.js';

export function up(db) {
  const exists = db.prepare(`SELECT 1 FROM settings WHERE name = 'baseUrl' AND user_id IS NULL LIMIT 1`).get();
  if (exists) return;

  const portRow = db.prepare(`SELECT value FROM settings WHERE name = 'port' AND user_id IS NULL LIMIT 1`).get();
  let port = 9998;
  try {
    port = JSON.parse(portRow?.value ?? '9998');
  } catch {
    /* keep default */
  }

  db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, 'baseUrl', @value, NULL)`,
  ).run({ id: nanoid(), create_date: Date.now(), value: JSON.stringify(guessBaseUrl(port)) });
}
