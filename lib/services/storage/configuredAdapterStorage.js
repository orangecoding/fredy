/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { toJson, fromJson } from '../../utils.js';

/**
 * Who may attach a channel to a job.
 *
 * `private` is the only value a non-admin can produce; the other two are an admin's decision.
 * @type {{PRIVATE: 'private', ADMIN: 'admin', EVERYONE: 'everyone'}}
 */
export const VISIBILITY = Object.freeze({ PRIVATE: 'private', ADMIN: 'admin', EVERYONE: 'everyone' });

const VISIBILITIES = new Set(Object.values(VISIBILITY));

/**
 * Coerce an untrusted visibility into a known one.
 * @param {any} value
 * @returns {string}
 */
export const normaliseVisibility = (value) => (VISIBILITIES.has(value) ? value : VISIBILITY.PRIVATE);

/**
 * @typedef {Object} Channel
 * @property {string} id
 * @property {string} userId - Owner.
 * @property {string} adapterId - Adapter type, e.g. 'telegram'. Fixed at creation.
 * @property {string} name - User-given label.
 * @property {Record<string, any>} fields
 * @property {string} visibility
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @param {Object} row
 * @returns {Channel}
 */
const mapRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  adapterId: row.adapter_id,
  name: row.name,
  fields: fromJson(row.fields, {}),
  visibility: row.visibility,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Every channel on the instance, unfiltered.
 *
 * Callers that answer a request must filter with `canUseChannel`. This is unfiltered on purpose:
 * `jobStorage` hydrates jobs it has already authorised, and needs the whole map.
 *
 * @returns {Channel[]}
 */
export const getAllChannels = () =>
  SqliteConnection.query(`SELECT * FROM configured_adapter ORDER BY name`).map(mapRow);

/**
 * @param {string} id
 * @returns {Channel|null}
 */
export const getChannel = (id) => {
  const row = SqliteConnection.query(`SELECT * FROM configured_adapter WHERE id = @id LIMIT 1`, { id })[0];
  return row ? mapRow(row) : null;
};

/**
 * Insert or update a channel.
 *
 * The owner and the adapter type are fixed at creation. An update that names a different owner or
 * adapter is ignored rather than rejected: the route has already checked who may edit this row,
 * and silently keeping the invariant is simpler than a second error path for something the UI
 * never sends.
 *
 * @param {Object} params
 * @param {string} [params.id] - Existing channel to update; omit to create.
 * @param {string} params.userId
 * @param {string} params.adapterId
 * @param {string} params.name
 * @param {Record<string, any>} params.fields
 * @param {string} [params.visibility]
 * @returns {string} The channel id.
 */
export const upsertChannel = ({ id, userId, adapterId, name, fields = {}, visibility }) => {
  const now = Date.now();
  const existing = id ? getChannel(id) : null;

  if (existing) {
    SqliteConnection.execute(
      `UPDATE configured_adapter
       SET name = @name, fields = @fields, visibility = @visibility, updated_at = @now
       WHERE id = @id`,
      { id: existing.id, name, fields: toJson(fields ?? {}), visibility: normaliseVisibility(visibility), now },
    );
    return existing.id;
  }

  const newId = id || nanoid();
  SqliteConnection.execute(
    `INSERT INTO configured_adapter (id, user_id, adapter_id, name, fields, visibility, created_at, updated_at)
     VALUES (@id, @userId, @adapterId, @name, @fields, @visibility, @now, @now)`,
    {
      id: newId,
      userId,
      adapterId,
      name,
      fields: toJson(fields ?? {}),
      visibility: normaliseVisibility(visibility),
      now,
    },
  );
  return newId;
};

/**
 * @param {string} id
 * @returns {void}
 */
export const removeChannel = (id) => {
  SqliteConnection.execute(`DELETE FROM configured_adapter WHERE id = @id`, { id });
};

/**
 * The jobs that reference a channel, so a blocked delete can name them.
 *
 * @param {string} id
 * @returns {{id: string, name: string}[]}
 */
export const getJobsUsingChannel = (id) =>
  SqliteConnection.query(
    `SELECT j.id, j.name
     FROM jobs j
     WHERE EXISTS (SELECT 1
                   FROM json_each(CASE WHEN json_valid(j.notification_adapter) AND json_type(j.notification_adapter) = 'array' THEN j.notification_adapter ELSE '[]' END) AS na
                   WHERE na.type = 'object'
                   AND json_extract(na.value, '$.configuredAdapterId') = @id)
     ORDER BY j.name`,
    { id },
  );

/**
 * How many jobs reference each channel, in one query.
 *
 * The list endpoint needs this for every row at once; asking per channel would be N+1.
 *
 * @returns {Map<string, number>}
 */
export const getUsageCounts = () => {
  const rows = SqliteConnection.query(
    `SELECT json_extract(na.value, '$.configuredAdapterId') AS channelId, COUNT(1) AS cnt
     FROM jobs j, json_each(CASE WHEN json_valid(j.notification_adapter) AND json_type(j.notification_adapter) = 'array' THEN j.notification_adapter ELSE '[]' END) AS na
     WHERE na.type = 'object'
     AND channelId IS NOT NULL
     GROUP BY channelId`,
  );
  return new Map(rows.map((row) => [row.channelId, row.cnt]));
};
