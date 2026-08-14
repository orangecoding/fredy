/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    withTransaction: (callback) => callback({ prepare: mocks.prepare }),
  },
}));

import { setManualAppointmentState } from '../../lib/services/storage/manualAppointmentStorage.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('manual appointment state', () => {
  it('marks the linked listing visited in the same transaction', () => {
    const updateAppointment = vi.fn(() => ({ changes: 1 }));
    const updateListing = vi.fn(() => ({ changes: 1 }));
    mocks.prepare.mockImplementation((sql) => {
      if (sql.startsWith('SELECT listing_id')) return { get: () => ({ listingId: 'l1' }) };
      if (sql.includes('UPDATE manual_appointments')) return { run: updateAppointment };
      if (sql.includes('UPDATE listings SET status')) return { run: updateListing };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    expect(setManualAppointmentState({ appointmentId: 'a1', userId: 'u1', state: 'completed' })).toBe(1);
    const payload = updateListing.mock.calls[0][0];
    expect(payload.listingId).toBe('l1');
    expect(JSON.parse(payload.status).status).toBe('visited');
  });

  it('does not update a listing when the appointment is not owned by the user', () => {
    mocks.prepare.mockReturnValue({ get: () => undefined });
    expect(setManualAppointmentState({ appointmentId: 'a1', userId: 'other', state: 'cancelled' })).toBe(0);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown appointment states', () => {
    expect(() => setManualAppointmentState({ appointmentId: 'a1', userId: 'u1', state: 'pending' })).toThrow(
      'Invalid appointment state.',
    );
  });
});
