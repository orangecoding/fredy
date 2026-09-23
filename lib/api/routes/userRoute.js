/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../../services/storage/userStorage.js';
import * as jobStorage from '../../services/storage/jobStorage.js';

/**
 * User administration.
 *
 * Registered under `adminHook`, so every handler here already has an admin. The demo-mode guards
 * that used to open each one read `demoMode && !isAdminUser(request)`, which is unreachable behind
 * that hook - they looked like protection and were dead code.
 */

function checkIfAnyAdminAfterRemovingUser(userIdToBeRemoved, allUser) {
  return allUser.filter((user) => user.id !== userIdToBeRemoved && user.isAdmin).length > 0;
}

function checkIfUserToBeRemovedIsLoggedIn(userIdToBeRemoved, request) {
  return request.session.currentUser === userIdToBeRemoved;
}

const nullOrEmpty = (str) => str == null || str.length === 0;

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function userPlugin(fastify) {
  fastify.get('/', async () => {
    return userStorage.getUsers();
  });

  fastify.get('/:userId', async (request, reply) => {
    const { userId } = request.params;
    const user = userStorage.getUser(userId);
    // A 404 rather than a 200 carrying `null`: the edit form treated `null` as an empty account and
    // offered to save it, which the POST below then turned into a brand new user.
    if (user == null) {
      return reply.code(404).send({ error: 'User not found.' });
    }
    return user;
  });

  /**
   * Hand out one user's MCP API token.
   *
   * Its own endpoint rather than a column on the user list: the token is a permanent bearer
   * credential, and shipping every user's with every listing meant it sat in the browser, in
   * devtools and in any support bundle for the whole session. Fetching it is now a deliberate act
   * by an admin who is about to configure an MCP client.
   */
  fastify.get('/:userId/mcp-token', async (request, reply) => {
    const { userId } = request.params;
    const mcpToken = userStorage.getMcpToken(userId);
    if (mcpToken == null) {
      return reply.code(404).send({ error: 'User not found or no token issued.' });
    }
    return { mcpToken };
  });

  fastify.delete('/', async (request, reply) => {
    const { userId } = request.body;
    const allUser = userStorage.getUsers();
    if (!checkIfAnyAdminAfterRemovingUser(userId, allUser)) {
      return reply.code(400).send({ error: 'You are trying to remove the last admin user. This is prohibited.' });
    }
    if (checkIfUserToBeRemovedIsLoggedIn(userId, request)) {
      return reply.code(400).send({ error: 'You are trying to remove yourself. This is prohibited.' });
    }
    jobStorage.removeJobsByUserId(userId);
    userStorage.removeUser(userId);
    return reply.send();
  });

  fastify.post('/', async (request, reply) => {
    const { password, password2, isAdmin, userId } = request.body;
    // Trimmed because the login form trims what it sends: an account saved as "kim " could never
    // sign in through the UI, and "kim" and "kim " could exist side by side.
    const username = typeof request.body.username === 'string' ? request.body.username.trim() : request.body.username;

    // Creating and editing are not the same request. `userStorage.upsertUser` has always known
    // that - its update branch says "Update password only if provided (non-empty string)" and
    // leaves the stored hash alone for an empty one. This check did not, so an edit that only
    // flipped the admin flag or renamed somebody was refused with "password is mandatory", and
    // the only way to change a role was to also give that person a new password and tell them
    // what it is. The branch in userStorage was unreachable.
    const isUpdate = !nullOrEmpty(userId);

    // An id is only an edit when it names an account that exists. `upsertUser` inserts for an
    // unknown id, and with the password check below relaxed for edits, an edit of a user deleted in
    // the meantime (another tab, an old link) would have created an account with an empty password.
    if (isUpdate && userStorage.getUser(userId) == null) {
      return reply.code(404).send({ error: 'User not found.' });
    }

    if (nullOrEmpty(username)) {
      return reply.code(400).send({ error: 'A username is mandatory.' });
    }
    // Unconditional: typing one of the two and not the other is a mistake either way.
    if (password !== password2) {
      return reply.code(400).send({ error: 'Passwords do not match.' });
    }
    if (!isUpdate && nullOrEmpty(password)) {
      return reply.code(400).send({ error: 'A password is mandatory for a new user.' });
    }

    // The unique index on `users.username` would refuse it anyway, but as a 500 whose message the UI
    // cannot show.
    const sameName = userStorage.getUserByUsername(username);
    if (sameName != null && sameName.id !== userId) {
      return reply.code(409).send({ error: 'A user with this name already exists.' });
    }

    const allUser = userStorage.getUsers();
    if (!isAdmin && !checkIfAnyAdminAfterRemovingUser(userId, allUser)) {
      return reply.code(400).send({
        error: 'You cannot change the admin flag for this user as otherwise, there is no other user in the system',
      });
    }
    await userStorage.upsertUser({ userId, username, password, isAdmin });
    return reply.send();
  });
}
