/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import { testFire, SAMPLE_LISTING } from '../../lib/notification/testFire.js';

const adapterFor = (send) => ({ config: { id: 'telegram', name: 'Telegram' }, send });

describe('testFire', () => {
  it('unwraps the form field shape into plain values', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await testFire(adapterFor(send), { token: { value: 'tok' }, chatId: { value: '123' } }, {});

    expect(send.mock.calls[0][0].notificationConfig).toEqual([
      { id: 'telegram', enabled: true, fields: { token: 'tok', chatId: '123' } },
    ]);
  });

  it('accepts plain values too, which is what the channel routes send', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await testFire(adapterFor(send), { token: 'tok', chatId: '123' }, {});

    expect(send.mock.calls[0][0].notificationConfig[0].fields).toEqual({ token: 'tok', chatId: '123' });
  });

  it('sends one sample listing under a recognisable job name', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await testFire(adapterFor(send), {}, {});

    const payload = send.mock.calls[0][0];
    expect(payload.newListings).toEqual([SAMPLE_LISTING]);
    expect(payload.serviceName).toBe('TestCall');
    expect(payload.jobKey).toBe('TestJob');
  });

  it('passes the user through so the browser adapter knows who to notify', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await testFire(adapterFor(send), {}, { userId: 'u1' });

    expect(send.mock.calls[0][0].userId).toBe('u1');
  });

  it('propagates the adapter failure so the route can report it', async () => {
    const send = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(testFire(adapterFor(send), {}, {})).rejects.toThrow('nope');
  });
});
