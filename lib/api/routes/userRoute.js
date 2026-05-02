/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as userStorage from '../../services/storage/userStorage.js';
import * as jobStorage from '../../services/storage/jobStorage.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin as isAdminUser } from '../security.js';

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
    return userStorage.getUsers(false);
  });

  fastify.get('/:userId', async (request) => {
    const { userId } = request.params;
    return userStorage.getUser(userId);
  });

  fastify.delete('/', async (request, reply) => {
    const settings = await getSettings();
    if (settings.demoMode && !isAdminUser(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to remove user.' });
    }

    const { userId } = request.body;
    const allUser = userStorage.getUsers(false);
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
    const settings = await getSettings();
    if (settings.demoMode && !isAdminUser(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change or add user.' });
    }

    const { username, password, password2, isAdmin, userId } = request.body;
    if (password !== password2) {
      return reply.code(400).send({ error: 'Passwords do not match.' });
    }
    if (nullOrEmpty(username) || nullOrEmpty(password) || nullOrEmpty(password2)) {
      return reply.code(400).send({ error: 'Username and password are mandatory.' });
    }
    const allUser = userStorage.getUsers(false);
    if (!isAdmin && !checkIfAnyAdminAfterRemovingUser(userId, allUser)) {
      return reply.code(400).send({
        error: 'You cannot change the admin flag for this user as otherwise, there is no other user in the system',
      });
    }
    userStorage.upsertUser({ userId, username, password, isAdmin });
    return reply.send();
  });
}
