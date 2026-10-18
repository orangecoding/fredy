/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getAllChannels: () => [
    { id: 'c-a', userId: 'alice' },
    { id: 'c-b', userId: 'bob' },
  ],
  getJobsUsingChannel: (id) =>
    id === 'c-a'
      ? [
          { id: 'job-alice', name: 'Alice search' },
          { id: 'job-bob', name: 'Bob search' },
        ]
      : [],
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (id) => ({ 'job-alice': { userId: 'alice' }, 'job-bob': { userId: 'bob' } })[id] ?? null,
}));
vi.mock('../../lib/services/storage/userStorage.js', () => ({}));

const { usedByOthers } = await import('../../lib/api/routes/userRoute.js');

describe('deleting a user whose channels other jobs use', () => {
  // The channels go with the user. Bob's job would keep finding listings and notify nobody.
  it("names the other users' jobs that would lose a channel", () => {
    expect(usedByOthers('alice')).toEqual([{ id: 'job-bob', name: 'Bob search' }]);
  });

  it("does not count the user's own jobs, which go with them", () => {
    expect(usedByOthers('bob')).toEqual([]);
  });
});
