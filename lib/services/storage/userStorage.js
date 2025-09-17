import { config } from '../../utils.js';
import * as hasher from '../security/hash.js';
import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';

/**
 * Get all users.
 *
 * Notes:
 * - Password hashes are omitted by default to avoid leaking them to callers that don’t need them.
 * - numberOfJobs is computed via a subquery for each user.
 *
 * @param {boolean} withPassword - If true, include the hashed password in the returned objects; otherwise set password to null.
 * @returns {User[]} Array of users ordered by username.
 */
export const getUsers = (withPassword) => {
  const rows = SqliteConnection.query(
    `SELECT u.id, u.username, u.password, u.last_login AS lastLogin, u.is_admin AS isAdmin,
            (SELECT COUNT(1) FROM jobs j WHERE j.user_id = u.id) AS numberOfJobs
       FROM users u
       ORDER BY u.username`,
  );
  return rows.map((u) => ({
    ...u,
    password: withPassword ? u.password : null,
    isAdmin: !!u.isAdmin,
  }));
};

/**
 * Get a single user by id.
 *
 * @param {string} id - User id (primary key).
 * @returns {User|null} The user when found; otherwise null. The password field is included but callers should not expose it.
 */
export const getUser = (id) => {
  const rows = SqliteConnection.query(
    `SELECT u.id, u.username, u.password, u.last_login AS lastLogin, u.is_admin AS isAdmin,
            (SELECT COUNT(1) FROM jobs j WHERE j.user_id = u.id) AS numberOfJobs
       FROM users u
      WHERE u.id = @id
      LIMIT 1`,
    { id },
  );
  const u = rows[0];
  if (!u) return null;
  return { ...u, isAdmin: !!u.isAdmin };
};

/**
 * Insert a new user or update an existing one.
 *
 * Behavior:
 * - When userId is provided and exists: updates username and isAdmin. Password is only updated when a non-empty password is provided.
 * - When userId is missing or does not exist: inserts a new user with a freshly generated id. last_login is initialized to null.
 * - Passwords are hashed using the same hashing function used for login comparison.
 *
 * @param {Object} params
 * @param {string} params.username - Username (must be unique in DB).
 * @param {string} [params.password] - Plain text password to set; if omitted on update, existing hash is preserved.
 * @param {string} [params.userId] - Existing user id to update; if missing, a new id is generated.
 * @param {boolean} params.isAdmin - Whether the user should have admin privileges.
 * @returns {void}
 */
export const upsertUser = ({ username, password, userId, isAdmin }) => {
  const id = userId || nanoid();
  // Check if user exists
  const exists = SqliteConnection.query(`SELECT 1 FROM users WHERE id = @id LIMIT 1`, { id }).length > 0;
  if (exists) {
    // Update existing user. Update password only if provided (non-empty string)
    if (password && password.length > 0) {
      SqliteConnection.execute(
        `UPDATE users SET username = @username, password = @password, is_admin = @is_admin WHERE id = @id`,
        { id, username, password: hasher.hash(password), is_admin: isAdmin ? 1 : 0 },
      );
    } else {
      SqliteConnection.execute(`UPDATE users SET username = @username, is_admin = @is_admin WHERE id = @id`, {
        id,
        username,
        is_admin: isAdmin ? 1 : 0,
      });
    }
  } else {
    SqliteConnection.execute(
      `INSERT INTO users (id, username, password, last_login, is_admin)
       VALUES (@id, @username, @password, @last_login, @is_admin)`,
      {
        id,
        username,
        password: hasher.hash(password || ''),
        last_login: null,
        is_admin: isAdmin ? 1 : 0,
      },
    );
  }
};

/**
 * Update the last_login timestamp to now for the given user.
 *
 * @param {{userId: string}} params - Parameters.
 * @param {string} params.userId - The user's id.
 * @returns {void}
 */
export const setLastLoginToNow = ({ userId }) => {
  SqliteConnection.execute(`UPDATE users SET last_login = @now WHERE id = @id`, { id: userId, now: Date.now() });
};

/**
 * Remove a user by id.
 *
 * Notes:
 * - In the SQLite schema, jobs reference users with ON DELETE CASCADE, so jobs (and their listings via jobs) are removed automatically.
 *
 * @param {string} userId - The id of the user to remove.
 * @returns {void}
 */
export const removeUser = (userId) => {
  SqliteConnection.execute(`DELETE FROM users WHERE id = @id`, { id: userId });
};

/**
 * Ensure the demo user matches the demo mode setting.
 *
 * Behavior:
 * - When config.demoMode is false: remove the demo user (and its cascading data via FKs).
 * - When config.demoMode is true: ensure a 'demo' user exists with password 'demo' and admin rights.
 *
 * Security: The demo user's password is set to a known value ('demo') and should only be enabled in demoMode.
 * @returns {void}
 */
export const ensureDemoUserExists = () => {
  if (!config.demoMode) {
    // Remove demo user (and cascade delete their jobs/listings)
    SqliteConnection.execute(`DELETE FROM users WHERE username = 'demo'`);
    return;
  }
  // Ensure demo user exists when demo mode is on
  const existing = SqliteConnection.query(`SELECT id FROM users WHERE username = 'demo' LIMIT 1`);
  if (existing.length === 0) {
    SqliteConnection.execute(
      `INSERT INTO users (id, username, password, last_login, is_admin)
       VALUES (@id, 'demo', @password, NULL, 1)`,
      { id: nanoid(), password: hasher.hash('demo') },
    );
  }
};

/**
 * Ensure there is at least one administrator in the system.
 *
 * Behavior:
 * - If there are no users at all, create default 'admin' user with password 'admin'.
 * - If users exist but none is admin, promote the first existing user to admin.
 *
 * Security: On a fresh instance, a default admin/admin is created; change this password immediately.
 * @returns {void}
 */
export const ensureAdminUserExists = () => {
  const anyUser = SqliteConnection.query(`SELECT id FROM users LIMIT 1`).length > 0;
  if (!anyUser) {
    SqliteConnection.execute(
      `INSERT INTO users (id, username, password, last_login, is_admin)
       VALUES (@id, 'admin', @password, @last_login, 1)`,
      { id: nanoid(), password: hasher.hash('admin'), last_login: Date.now() },
    );
    return;
  }
  const adminCount = SqliteConnection.query(`SELECT COUNT(1) AS c FROM users WHERE is_admin = 1`)[0]?.c ?? 0;
  if (adminCount === 0) {
    const firstUser = SqliteConnection.query(`SELECT id FROM users LIMIT 1`)[0];
    if (firstUser) {
      SqliteConnection.execute(`UPDATE users SET is_admin = 1 WHERE id = @id`, { id: firstUser.id });
    }
  }
};
