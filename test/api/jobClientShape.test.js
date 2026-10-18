/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({ default: { query: () => [], execute: () => {} } }));

const { toClientJob } = await import('../../lib/api/routes/jobRouter.js');

describe('toClientJob', () => {
  const job = {
    id: 'j1',
    name: 'Düsseldorf',
    notificationAdapter: [
      { id: 'telegram', name: 'Family chat', configuredAdapterId: 'c1', fields: { token: 'secret', chatId: '-100' } },
    ],
  };

  // The job list went to every user who may use a channel or has a job shared with them, and it
  // carried the channel's bot token and passwords along.
  it('drops the channel fields, which can hold tokens and passwords', () => {
    const client = toClientJob(job);
    expect(client.notificationAdapter).toEqual([{ id: 'telegram', name: 'Family chat', configuredAdapterId: 'c1' }]);
    expect(JSON.stringify(client)).not.toMatch(/secret/);
  });

  it('leaves the rest of the job and the stored object alone', () => {
    const client = toClientJob(job);
    expect(client.name).toBe('Düsseldorf');
    expect(job.notificationAdapter[0].fields.token).toBe('secret');
    expect(toClientJob({ id: 'j2' }).notificationAdapter).toEqual([]);
  });
});
