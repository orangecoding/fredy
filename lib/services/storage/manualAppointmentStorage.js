/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import { fromJson } from '../../utils.js';
import SqliteConnection from './SqliteConnection.js';
import { jobAccessSql } from './listingAccessSql.js';

const STATES = ['scheduled', 'completed', 'cancelled'];

export function listManualAppointments(userId, { includeArchived = true, isAdmin = false } = {}) {
  return SqliteConnection.query(
    `SELECT a.id, a.listing_id AS listingId, a.starts_at AS startsAt, a.timezone,
            a.location, a.state, a.created_at AS createdAt, a.updated_at AS updatedAt,
            l.title, l.address, l.provider, l.link, l.image_url AS imageUrl, l.status
       FROM manual_appointments a
       JOIN listings l ON l.id = a.listing_id
       JOIN jobs j ON j.id = l.job_id
      WHERE a.user_id = @userId
        AND l.manually_deleted = 0
        AND (@isAdmin = 1 OR ${jobAccessSql('j')})
        AND (@includeArchived = 1 OR a.state = 'scheduled')
      ORDER BY a.starts_at ASC`,
    { userId, isAdmin: isAdmin ? 1 : 0, includeArchived: includeArchived ? 1 : 0 },
  ).map((row) => ({
    ...row,
    status: fromJson(row.status, null),
  }));
}

export function saveManualAppointment({
  listingId,
  userId,
  startsAt,
  timezone = 'Europe/Berlin',
  location = null,
  reschedule = false,
}) {
  const start = Number(startsAt);
  if (!Number.isFinite(start) || start <= 0) throw new Error('A valid appointment start is required.');
  const now = Date.now();
  const id = nanoid();
  return SqliteConnection.withTransaction((db) =>
    db
      .prepare(
        `INSERT INTO manual_appointments
           (id, listing_id, user_id, starts_at, timezone, location, state, created_at, updated_at)
         VALUES (@id, @listingId, @userId, @startsAt, @timezone, @location, 'scheduled', @now, @now)
         ON CONFLICT(listing_id, user_id) DO UPDATE SET
           starts_at = excluded.starts_at,
           timezone = excluded.timezone,
           location = excluded.location,
           state = CASE WHEN @reschedule = 1 THEN 'scheduled' ELSE manual_appointments.state END,
           updated_at = excluded.updated_at
         RETURNING id, listing_id AS listingId, starts_at AS startsAt, timezone, location, state`,
      )
      .get({ id, listingId, userId, startsAt: start, timezone, location, reschedule: reschedule ? 1 : 0, now }),
  );
}

export function setManualAppointmentState({ appointmentId, userId, isAdmin = false, state }) {
  if (!STATES.includes(state)) throw new Error('Invalid appointment state.');
  return SqliteConnection.withTransaction((db) => {
    const appointment = db
      .prepare(
        `SELECT a.listing_id AS listingId
           FROM manual_appointments a
           JOIN listings l ON l.id = a.listing_id
           JOIN jobs j ON j.id = l.job_id
          WHERE a.id = @appointmentId
            AND a.user_id = @userId
            AND (@isAdmin = 1 OR ${jobAccessSql('j')})`,
      )
      .get({ appointmentId, userId, isAdmin: isAdmin ? 1 : 0 });
    if (!appointment) return 0;

    const result = db
      .prepare(
        `UPDATE manual_appointments
            SET state = @state, updated_at = @now
          WHERE id = @appointmentId AND user_id = @userId`,
      )
      .run({ appointmentId, userId, state, now: Date.now() });

    if (state === 'completed') {
      db.prepare('UPDATE listings SET status = @status WHERE id = @listingId').run({
        listingId: appointment.listingId,
        status: JSON.stringify({ status: 'visited', setAt: Date.now() }),
      });
    }
    return result.changes;
  });
}

export function completeManualAppointmentForListing({ listingId, userId }) {
  const result = SqliteConnection.execute(
    `UPDATE manual_appointments
        SET state = 'completed', updated_at = @now
      WHERE listing_id = @listingId AND user_id = @userId AND state = 'scheduled'`,
    { listingId, userId, now: Date.now() },
  );
  return result?.changes ?? 0;
}

export function cancelManualAppointmentForListing({ listingId, userId }) {
  const result = SqliteConnection.execute(
    `UPDATE manual_appointments
        SET state = 'cancelled', updated_at = @now
      WHERE listing_id = @listingId AND user_id = @userId AND state = 'scheduled'`,
    { listingId, userId, now: Date.now() },
  );
  return result?.changes ?? 0;
}
