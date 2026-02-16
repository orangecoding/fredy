/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

// Migration: Create fredy's base structure (users, jobs and listings) import initial
// data from JSON files if present. (This applies only for jobs and users, for the old jobListingData,
// I cannot migrate the data as the new format is totally different.

import fs from 'fs';
import path from 'path';
import { toJson } from '../../../../utils.js';

export function up(db) {
  // 1) Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users
    (
      id         TEXT PRIMARY KEY,
      username   TEXT    NOT NULL,
      password   TEXT    NOT NULL,
      last_login INTEGER,
      is_admin   INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);

    CREATE TABLE IF NOT EXISTS jobs
    (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT    NOT NULL,
      enabled              INTEGER NOT NULL DEFAULT 1,
      name                 TEXT,
      blacklist            JSONB   NOT NULL DEFAULT '[]',
      provider             JSONB   NOT NULL DEFAULT '[]',
      notification_adapter JSONB   NOT NULL DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs (user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs (enabled);

    CREATE TABLE IF NOT EXISTS listings
    (
      id          TEXT PRIMARY KEY,
      created_at  INTEGER,
      hash        TEXT,
      provider    TEXT,
      job_id      TEXT,
      price       INTEGER,
      size        INTEGER,
      title       TEXT,
      image_url   TEXT,
      description TEXT,
      address     TEXT,
      link        TEXT,
      FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_hash ON listings (hash);
  `);

  // 2) Optionally import data from JSON files if present for users and jobs
  const ROOT = path.resolve('.');
  const usersJsonPath = path.join(ROOT, 'db', 'users.json');
  const jobsJsonPath = path.join(ROOT, 'db', 'jobs.json');

  // Insert users
  if (fs.existsSync(usersJsonPath)) {
    try {
      const raw = fs.readFileSync(usersJsonPath, 'utf8');
      const json = JSON.parse(raw);
      const arr = Array.isArray(json?.user) ? json.user : [];
      if (arr.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO users (id, username, password, last_login, is_admin)
           VALUES (@id, @username, @password, @last_login, @is_admin)`,
        );
        for (const u of arr) {
          stmt.run({
            id: u.id,
            username: u.username,
            password: u.password,
            last_login: u.lastLogin ?? null,
            is_admin: u.isAdmin ? 1 : 0,
          });
        }
      }
    } catch (e) {
      // If parsing fails, let it throw to rollback the migration
      throw new Error(`Failed to import users from ${usersJsonPath}: ${e.message}`, { cause: e });
    }
  }

  // Insert jobs
  if (fs.existsSync(jobsJsonPath)) {
    try {
      const raw = fs.readFileSync(jobsJsonPath, 'utf8');
      const json = JSON.parse(raw);
      const arr = Array.isArray(json?.jobs) ? json.jobs : [];
      if (arr.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO jobs (id, user_id, enabled, name, blacklist, provider, notification_adapter)
           VALUES (@id, @user_id, @enabled, @name, @blacklist, @provider, @notification_adapter)`,
        );
        for (const j of arr) {
          stmt.run({
            id: j.id,
            user_id: j.userId,
            enabled: j.enabled ? 1 : 0,
            name: j.name ?? null,
            blacklist: toJson(j.blacklist ?? []),
            provider: toJson(j.provider ?? []),
            notification_adapter: toJson(j.notificationAdapter ?? []),
          });
        }
      }
    } catch (e) {
      throw new Error(`Failed to import jobs from ${jobsJsonPath}: ${e.message}`, { cause: e });
    }
  }
}
