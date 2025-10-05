import SqliteConnection from './SqliteConnection.js';
import { nanoid } from 'nanoid';

/**
 * Create a watch entry. Idempotent due to unique index (listing_id, user_id).
 * @param {string} listingId
 * @param {string} userId
 * @returns {{created:boolean}}
 */
export const createWatch = (listingId, userId) => {
  if (!listingId || !userId) return { created: false };
  try {
    SqliteConnection.execute(
      `INSERT INTO watch_list (id, listing_id, user_id)
       VALUES (@id, @listing_id, @user_id)
       ON CONFLICT(listing_id, user_id) DO NOTHING`,
      { id: nanoid(), listing_id: listingId, user_id: userId },
    );
    // check whether it exists now
    const row = SqliteConnection.query(
      `SELECT 1 AS ok FROM watch_list WHERE listing_id = @listing_id AND user_id = @user_id LIMIT 1`,
      { listing_id: listingId, user_id: userId },
    );
    return { created: row.length > 0 };
  } catch {
    return { created: false };
  }
};

/**
 * Delete a watch entry.
 * @param {string} listingId
 * @param {string} userId
 * @returns {{deleted:boolean}}
 */
export const deleteWatch = (listingId, userId) => {
  if (!listingId || !userId) return { deleted: false };
  const res = SqliteConnection.execute(`DELETE FROM watch_list WHERE listing_id = @listing_id AND user_id = @user_id`, {
    listing_id: listingId,
    user_id: userId,
  });
  return { deleted: Boolean(res?.changes) };
};

/**
 * Toggle a watch entry. If exists -> delete, otherwise create.
 * @param {string} listingId
 * @param {string} userId
 * @returns {{watched:boolean}}
 */
export const toggleWatch = (listingId, userId) => {
  if (!listingId || !userId) return { watched: false };
  const exists =
    SqliteConnection.query(
      `SELECT 1 AS ok FROM watch_list WHERE listing_id = @listing_id AND user_id = @user_id LIMIT 1`,
      { listing_id: listingId, user_id: userId },
    ).length > 0;
  if (exists) {
    deleteWatch(listingId, userId);
    return { watched: false };
  }
  createWatch(listingId, userId);
  return { watched: true };
};
