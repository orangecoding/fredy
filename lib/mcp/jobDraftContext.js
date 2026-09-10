/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Everything the job interview needs to know about this instance and this user.
 *
 * Split out from `jobDraftStore.js` on purpose. The store is pure - it validates answers and works
 * out the next question - and this is the only part that reads the database. That keeps the store
 * testable without one, and it puts the channel-stripping in a single place: a channel row carries
 * the bot token, and nothing that reaches an LLM may.
 */

import { getProviders } from '../utils.js';
import { getAllChannels } from '../services/storage/configuredAdapterStorage.js';
import { canUseChannel } from '../services/security/channelAccess.js';
import { getAddresses, getUserSettings } from '../services/storage/settingsStorage.js';
import { getUsers } from '../services/storage/userStorage.js';

/**
 * @param {{id: string, isAdmin?: boolean}} user
 * @returns {Promise<import('./jobDraftStore.js').DraftContext>}
 */
export async function buildDraftContext(user) {
  const providers = (await getProviders())
    .map((provider) => provider.metaInformation)
    .filter((meta) => meta?.id != null && meta?.baseUrl != null)
    .map(({ id, name, baseUrl }) => ({ id, name, baseUrl }));

  // `fields` is dropped here rather than at the point of rendering: a channel object that still
  // carries its token cannot leak from a place it never reaches.
  const channels = getAllChannels()
    .filter((channel) => canUseChannel(user, channel))
    .map(({ id, name, adapterId }) => ({ id, name, adapterId }));

  const addresses = getAddresses(getUserSettings(user.id))
    .map((address) => address?.label)
    .filter((label) => typeof label === 'string' && label.trim().length > 0);

  // The same rule the web UI's shareable-user list uses: admins see everything anyway, and a job
  // cannot be shared with its own owner.
  const shareableUsers = getUsers()
    .filter((candidate) => !candidate.isAdmin && candidate.id !== user.id)
    .map((candidate) => ({ id: candidate.id, name: candidate.username }));

  return { providers, channels, addresses, shareableUsers };
}
