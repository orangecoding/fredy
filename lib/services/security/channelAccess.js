/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Whether a user may attach a notification channel to one of their jobs.
 *
 * Deliberately separate from {@link canEditChannel}: being allowed to send through somebody's
 * Telegram bot is not the same as being allowed to read its token.
 *
 * @param {{id: string, isAdmin?: boolean}|null|undefined} user
 * @param {{userId?: string, visibility?: string}|null|undefined} channel
 * @returns {boolean}
 */
export function canUseChannel(user, channel) {
  if (user == null || channel == null) return false;
  if (user.isAdmin === true) return true;
  if (user.id != null && channel.userId === user.id) return true;
  // 'everyone' must match VISIBILITY.EVERYONE in configuredAdapterStorage.js; literal here keeps this module free of the storage layer.
  return channel.visibility === 'everyone';
}

/**
 * Whether a user may rename, reconfigure, delete or read the secrets of a channel.
 *
 * @param {{id: string, isAdmin?: boolean}|null|undefined} user
 * @param {{userId?: string}|null|undefined} channel
 * @returns {boolean}
 */
export function canEditChannel(user, channel) {
  if (user == null || channel == null) return false;
  return user.isAdmin === true || (user.id != null && channel.userId === user.id);
}
