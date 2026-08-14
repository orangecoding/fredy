/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  listManualAppointments,
  saveManualAppointment,
  setManualAppointmentState,
} from '../../services/storage/manualAppointmentStorage.js';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import { isAdmin as isAdminFn } from '../security.js';

export default async function appointmentPlugin(fastify) {
  fastify.get('/', async (request) =>
    listManualAppointments(request.session.currentUser, {
      includeArchived: request.query?.includeArchived !== 'false',
    }),
  );

  fastify.post('/', async (request, reply) => {
    const userId = request.session.currentUser;
    const listingId = String(request.body?.listingId ?? '');
    if (!listingStorage.userCanAccessListing(listingId, userId, isAdminFn(request))) {
      return reply.code(404).send({ error: 'Listing not found.' });
    }
    try {
      return saveManualAppointment({ ...request.body, listingId, userId });
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.put('/:appointmentId/state', async (request, reply) => {
    try {
      const changes = setManualAppointmentState({
        appointmentId: String(request.params.appointmentId),
        userId: request.session.currentUser,
        state: request.body?.state,
      });
      if (changes === 0) return reply.code(404).send({ error: 'Appointment not found.' });
      return { updated: true };
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });
}
