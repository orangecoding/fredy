/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';

/**
 * Mark every account that already exists as having no need for the onboarding tour.
 *
 * The tour is offered to accounts without an `onboarding_tour` setting, which is meant to mean
 * "new here". Without this migration it would also mean "was here before the tour existed", and the
 * first load after upgrading would offer an introduction to everybody who has used Fredy for years.
 *
 * The marker says `preexisting` rather than `declined` because nobody declined anything, and the
 * difference matters to anybody reading the table later. Accounts created afterwards get no row, so
 * the tour is offered to them on their first visit.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const users = db.prepare(`SELECT id FROM users`).all();
  const exists = db.prepare(`SELECT 1 FROM settings WHERE name = 'onboarding_tour' AND user_id = @userId LIMIT 1`);
  const insert = db.prepare(
    `INSERT INTO settings (id, create_date, name, value, user_id)
     VALUES (@id, @create_date, 'onboarding_tour', @value, @userId)`,
  );

  for (const { id: userId } of users) {
    if (exists.get({ userId })) continue;
    insert.run({
      id: nanoid(),
      create_date: Date.now(),
      value: JSON.stringify({ status: 'preexisting' }),
      userId,
    });
  }
}
