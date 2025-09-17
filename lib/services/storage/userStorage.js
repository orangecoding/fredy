import { config } from '../../utils.js';
import * as hasher from '../security/hash.js';
import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';

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

export const setLastLoginToNow = ({ userId }) => {
  SqliteConnection.execute(`UPDATE users SET last_login = @now WHERE id = @id`, { id: userId, now: Date.now() });
};

export const removeUser = (userId) => {
  SqliteConnection.execute(`DELETE FROM users WHERE id = @id`, { id: userId });
};

/**
 * Ensure the demo user matches the demo mode setting.
 * - When config.demoMode is false: remove the demo user (and its cascading data via FKs).
 * - When config.demoMode is true: ensure a 'demo' user exists with password 'demo' and admin rights.
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
 * Behavior:
 * - If there are no users at all, create default 'admin' user with password 'admin'.
 * - If users exist but none is admin, promote the first existing user to admin.
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
