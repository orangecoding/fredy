/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { up as createManualAppointments } from '../../lib/services/storage/migrations/sql/35.manual-appointments.js';

const mocks = vi.hoisted(() => ({ db: null }));

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params) => mocks.db.prepare(sql).all(params),
    execute: (sql, params) => mocks.db.prepare(sql).run(params),
    withTransaction: (callback) => mocks.db.transaction(() => callback(mocks.db))(),
  },
}));

import {
  listManualAppointments,
  saveManualAppointment,
  setManualAppointmentState,
} from '../../lib/services/storage/manualAppointmentStorage.js';

beforeEach(() => {
  mocks.db = new Database(':memory:');
  mocks.db.pragma('foreign_keys = ON');
  mocks.db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      shared_with_user TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE listings (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      title TEXT,
      address TEXT,
      provider TEXT,
      link TEXT,
      image_url TEXT,
      status TEXT,
      manually_deleted INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO users (id) VALUES ('owner'), ('guest'), ('admin');
    INSERT INTO jobs (id, user_id, shared_with_user) VALUES ('j1', 'owner', '["guest"]');
    INSERT INTO listings (id, job_id, title, address) VALUES ('l1', 'j1', 'Flat', 'Berlin');
  `);
  createManualAppointments(mocks.db);
});

afterEach(() => {
  mocks.db.close();
  mocks.db = null;
});

describe('manual appointment storage', () => {
  it('revalidates current listing access for reads and state changes', () => {
    const appointment = saveManualAppointment({ listingId: 'l1', userId: 'guest', startsAt: 1000 });
    expect(listManualAppointments('guest')).toHaveLength(1);

    mocks.db.prepare(`UPDATE jobs SET shared_with_user = '[]' WHERE id = 'j1'`).run();

    expect(listManualAppointments('guest')).toEqual([]);
    expect(setManualAppointmentState({ appointmentId: appointment.id, userId: 'guest', state: 'completed' })).toBe(0);
    expect(mocks.db.prepare(`SELECT status FROM listings WHERE id = 'l1'`).get().status).toBeNull();
  });

  it('allows an administrator to access an appointment they own for any listing', () => {
    saveManualAppointment({ listingId: 'l1', userId: 'admin', startsAt: 1000 });
    expect(listManualAppointments('admin', { isAdmin: false })).toEqual([]);
    expect(listManualAppointments('admin', { isAdmin: true })).toHaveLength(1);
  });

  it('returns the persisted id and preserves archived state when editing', () => {
    const created = saveManualAppointment({ listingId: 'l1', userId: 'guest', startsAt: 1000 });
    expect(setManualAppointmentState({ appointmentId: created.id, userId: 'guest', state: 'completed' })).toBe(1);

    const edited = saveManualAppointment({ listingId: 'l1', userId: 'guest', startsAt: 2000 });
    expect(edited).toMatchObject({ id: created.id, startsAt: 2000, state: 'completed' });

    const rescheduled = saveManualAppointment({
      listingId: 'l1',
      userId: 'guest',
      startsAt: 3000,
      reschedule: true,
    });
    expect(rescheduled).toMatchObject({ id: created.id, startsAt: 3000, state: 'scheduled' });
  });

  it('rejects unknown appointment states', () => {
    expect(() => setManualAppointmentState({ appointmentId: 'a1', userId: 'guest', state: 'pending' })).toThrow(
      'Invalid appointment state.',
    );
  });
});
