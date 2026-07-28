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

  fastify.get('/:userId', async (request) => {
    const { userId } = request.params;
    return userStorage.getUser(userId);
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
    const { username, password, password2, isAdmin, userId } = request.body;
    if (password !== password2) {
      return reply.code(400).send({ error: 'Passwords do not match.' });
    }
    if (nullOrEmpty(username) || nullOrEmpty(password) || nullOrEmpty(password2)) {
      return reply.code(400).send({ error: 'Username and password are mandatory.' });
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
