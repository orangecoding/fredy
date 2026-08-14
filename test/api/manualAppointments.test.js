/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/manualAppointmentStorage.js', () => ({
  listManualAppointments: vi.fn(() => [{ id: 'a1', listingId: 'l1', startsAt: 1000 }]),
  saveManualAppointment: vi.fn((value) => ({ id: 'a1', ...value, state: 'scheduled' })),
  setManualAppointmentState: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  userCanAccessListing: vi.fn(() => true),
}));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import {
  listManualAppointments,
  saveManualAppointment,
  setManualAppointmentState,
} from '../../lib/services/storage/manualAppointmentStorage.js';
import { userCanAccessListing } from '../../lib/services/storage/listingsStorage.js';
import appointmentPlugin from '../../lib/api/routes/appointmentRouter.js';

async function app() {
  const instance = Fastify();
  instance.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'u1' };
  });
  await instance.register(appointmentPlugin);
  await instance.ready();
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  userCanAccessListing.mockReturnValue(true);
  setManualAppointmentState.mockReturnValue(1);
});

describe('manual appointment routes', () => {
  it('lists only appointments for the signed-in user', async () => {
    const response = await (await app()).inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(listManualAppointments).toHaveBeenCalledWith('u1', { includeArchived: true });
  });

  it('creates an appointment only for an accessible listing', async () => {
    const response = await (
      await app()
    ).inject({
      method: 'POST',
      url: '/',
      payload: { listingId: 'l1', startsAt: 2000, timezone: 'Europe/Berlin' },
    });
    expect(response.statusCode).toBe(200);
    expect(saveManualAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'l1', userId: 'u1', startsAt: 2000 }),
    );

    userCanAccessListing.mockReturnValue(false);
    const denied = await (
      await app()
    ).inject({ method: 'POST', url: '/', payload: { listingId: 'l2', startsAt: 2000 } });
    expect(denied.statusCode).toBe(404);
  });

  it('updates state only within the signed-in user scope', async () => {
    const response = await (
      await app()
    ).inject({
      method: 'PUT',
      url: '/a1/state',
      payload: { state: 'completed' },
    });
    expect(response.statusCode).toBe(200);
    expect(setManualAppointmentState).toHaveBeenCalledWith({ appointmentId: 'a1', userId: 'u1', state: 'completed' });
  });
});
