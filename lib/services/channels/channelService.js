/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Notification channels: listing, saving, deleting and test-firing them.
 *
 * The web routes (`notificationChannelRouter.js`) and the MCP channel tools both call these, so
 * every rule - who may edit a channel, which fields only an admin sets, which ones Fredy generates,
 * who decides visibility, what a channel needs before it can notify anybody - is written once. The
 * one difference between the two callers is passed in: the web form sends the whole field bag back
 * on every save, while a model is never shown a secret and can only send the fields that change, so
 * the MCP tools ask for `mergeFields`.
 */

import logger from '../logger.js';
import { getNotificationAdapters } from '../../utils.js';
import { describeChannel } from '../../notification/adapterSummary.js';
import { testFire } from '../../notification/testFire.js';
import {
  assertPrivilegedFieldsUnchanged,
  privilegedFieldError,
  settleGeneratedFields,
} from '../security/adapterFields.js';
import { canEditChannel, canUseChannel } from '../security/channelAccess.js';
import { isPlainObject, UNSAFE_KEYS } from '../security/plainObject.js';
import {
  getAllChannels,
  getChannel,
  getJobsUsingChannel,
  getUsageCounts,
  normaliseVisibility,
  removeChannel,
  upsertChannel,
  VISIBILITY,
} from '../storage/configuredAdapterStorage.js';
import { fail } from '../serviceResult.js';

/**
 * @typedef {import('../storage/configuredAdapterStorage.js').Channel} Channel
 * @typedef {import('../serviceResult.js').ServiceFailure} ServiceFailure
 * @typedef {{id: string, isAdmin?: boolean}} User
 *
 * @typedef {Object} ChannelSummary
 * @property {string} id
 * @property {string} adapterId
 * @property {string} adapterName
 * @property {string} name
 * @property {string|null} destination - Where it sends to, without a secret in it.
 * @property {string} visibility
 * @property {number} usedByJobs
 * @property {boolean} canEdit
 * @property {boolean} isOwner
 */

/**
 * One installed adapter module, within a list the caller already loaded.
 *
 * The one rule for finding an adapter by its id. {@link configOf} answers its static config for
 * the callers that only describe a channel; the test send needs the module itself, to fire it.
 *
 * @param {Array<Object>} adapters - Adapter modules, as `getNotificationAdapters` answers.
 * @param {string|null|undefined} adapterId
 * @returns {Object|null} The adapter module, or null for an adapter this Fredy does not have (any
 *   more).
 */
const adapterOf = (adapters, adapterId) => adapters.find((adapter) => adapter?.config?.id === adapterId) ?? null;

/**
 * The static config of one installed adapter, within a list the caller already loaded.
 *
 * Wherever a list of adapter modules is in hand: the router holds the one it loaded for its
 * requests, the listing below the one it loaded itself.
 *
 * @param {Array<Object>} adapters - Adapter modules, as `getNotificationAdapters` answers.
 * @param {string|null|undefined} adapterId
 * @returns {Object|null} The adapter's static config, or null for an adapter this Fredy does not
 *   have (any more).
 */
export const configOf = (adapters, adapterId) => adapterOf(adapters, adapterId)?.config ?? null;

/**
 * The static config of one installed adapter.
 *
 * @param {string|null|undefined} adapterId
 * @returns {Promise<Object|null>} Null for an adapter this Fredy does not have (any more).
 */
export async function adapterConfigOf(adapterId) {
  return configOf(await getNotificationAdapters(), adapterId);
}

/**
 * A channel as a list shows it: what it is and where it sends, never a field value.
 *
 * @param {Channel} channel
 * @param {User} user - Who is looking, for `canEdit` and `isOwner`.
 * @param {Map<string, number>} usage - Job count per channel id, from `getUsageCounts`.
 * @param {Object|null} adapterConfig - The channel's adapter config, null when it is gone.
 * @returns {ChannelSummary}
 */
export function summarizeChannel(channel, user, usage, adapterConfig) {
  return {
    id: channel.id,
    adapterId: channel.adapterId,
    adapterName: adapterConfig?.name ?? channel.adapterId,
    name: channel.name,
    destination: describeChannel(adapterConfig, channel.fields),
    visibility: channel.visibility,
    usedByJobs: usage.get(channel.id) ?? 0,
    canEdit: canEditChannel(user, channel),
    isOwner: channel.userId === user.id,
  };
}

/**
 * Every channel the user may attach to a job, summarised.
 *
 * @param {User} user
 * @returns {Promise<ChannelSummary[]>}
 */
export async function listUsableChannels(user) {
  const adapters = await getNotificationAdapters();
  const usage = getUsageCounts();
  return getAllChannels()
    .filter((channel) => canUseChannel(user, channel))
    .map((channel) => summarizeChannel(channel, user, usage, configOf(adapters, channel.adapterId)));
}

/**
 * Apply the fields a caller sent to a channel's stored fields, key by key.
 *
 * Left out entirely, every stored value stays. Otherwise each key sent replaces that one value and
 * null removes it. Flat, because a field bag is flat.
 *
 * @param {Record<string, unknown>} stored - The stored fields, `{}` when creating. Not mutated.
 * @param {Record<string, unknown>|undefined} patch
 * @returns {Record<string, unknown>}
 */
export function mergeChannelFields(stored, patch) {
  const next = { ...stored };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/**
 * The fields a channel cannot work without that have no value, by the rule the web form's
 * `validateChannel` applies before it sends: every field not marked `optional`, except a switch (a
 * boolean is always one or the other) and a field Fredy fills in itself.
 *
 * @param {{fields?: Record<string, {type?: string, optional?: boolean, generated?: boolean}>}} config
 * @param {Record<string, unknown>} fields - The field bag about to be stored.
 * @returns {string[]} The missing field names, in the adapter's order.
 */
export function missingMandatoryFields(config, fields) {
  return Object.entries(config?.fields ?? {})
    .filter(
      ([, definition]) =>
        definition?.optional !== true && definition?.generated !== true && definition?.type !== 'boolean',
    )
    .filter(([key]) => fields?.[key] == null || String(fields[key]).trim().length === 0)
    .map(([key]) => key);
}

/**
 * The field bag a save is about to store, before Fredy's own fields are settled.
 *
 * A body with no `fields` keeps the stored bag in both modes, so a rename can never wipe a secret.
 * With `fields`, the web form's save replaces the bag - the form holds every stored value and sends
 * them all back - and the MCP tools' save merges into it, because a model is never shown a secret
 * and would otherwise have to wipe the token to change the chat id next to it.
 *
 * @param {Record<string, unknown>|null} storedFields - Null when creating.
 * @param {Record<string, unknown>|null|undefined} sentFields
 * @param {boolean} mergeFields
 * @returns {Record<string, unknown>}
 */
function resolveFields(storedFields, sentFields, mergeFields) {
  if (sentFields === undefined) return { ...(storedFields ?? {}) };
  if (mergeFields) return mergeChannelFields(storedFields ?? {}, sentFields ?? {});
  return mergeChannelFields({}, sentFields ?? {});
}

/**
 * Validate and store a channel, created or updated.
 *
 * In order: the channel exists and the user may edit it; the adapter type (fixed at creation)
 * is installed; there is a name; every field sent is one the adapter defines; the field bag is
 * resolved (replaced or merged, see {@link resolveFields}) and Fredy's generated fields settled
 * over it; visibility is decided (an admin's call, private otherwise); privileged fields are
 * unchanged unless an admin changes them; and no mandatory field is left empty. A save that sends no
 * fields is not held to that last rule, so an older, incomplete channel can still be renamed.
 *
 * A key the body leaves out (`undefined`) keeps what is stored: the name on an update, the field
 * bag, the visibility. JSON cannot carry `undefined`, so for the web route that is exactly "the key
 * is not in the body".
 *
 * @param {User} user
 * @param {{id?: string|null, adapterId?: string, name?: string, fields?: Record<string, unknown>|null, visibility?: string}} body
 * @param {{mergeFields?: boolean}} [options]
 * @returns {Promise<ServiceFailure|{ok: true, channel: Channel, created: boolean, adapterConfig: Object}>}
 */
export async function saveChannel(user, body, { mergeFields = false } = {}) {
  const isAdmin = user?.isAdmin === true;
  const existing = body.id != null ? getChannel(body.id) : null;
  if (body.id != null && existing == null) return fail('notFound', 'Notification channel not found.');
  if (existing != null && !canEditChannel(user, existing)) {
    return fail('forbidden', 'You are not allowed to change this notification channel.');
  }

  // The adapter type is fixed at creation: the stored fields only make sense for one adapter.
  const adapterId = existing ? existing.adapterId : body.adapterId;
  const config = await adapterConfigOf(adapterId);
  if (config == null) {
    return fail('invalid', `Unknown notification type: ${adapterId ?? '–'}.`, { code: 'unknownAdapter' });
  }

  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    return fail('invalid', 'A notification channel needs a name.', { code: 'name' });
  }
  const name = body.name !== undefined ? body.name.trim() : existing?.name;
  if (name == null) return fail('invalid', 'A notification channel needs a name.', { code: 'name' });

  if (body.fields != null && !isPlainObject(body.fields)) {
    return fail('invalid', 'fields must be an object of field values.', { code: 'fields' });
  }
  // A field name the adapter does not define is a typo. Under a merge it would be stored next to
  // the real field, which keeps its old value, and the save would answer OK for a change that
  // never happened; under a replace the real field would silently go missing.
  const unknownKeys = Object.keys(body.fields ?? {}).filter((key) => !Object.hasOwn(config.fields ?? {}, key));
  if (unknownKeys.length > 0) {
    const known = Object.keys(config.fields ?? {});
    return fail(
      'invalid',
      `${config.name} has no field ${unknownKeys.map((key) => `"${key}"`).join(', ')}. ` +
        `Its fields: ${known.length > 0 ? known.join(', ') : 'none'}.`,
      { code: 'unknownFields' },
    );
  }

  // Fields Fredy creates itself (a feed token) are settled here and never taken from the body.
  const fields = settleGeneratedFields(
    config,
    resolveFields(existing?.fields ?? null, body.fields, mergeFields),
    existing?.fields ?? null,
  );

  // Only an admin decides who may use a channel, and only when the body actually asks to change it
  // - leaving it out keeps the stored value, for admins as well as non-admins. A non-admin's
  // channel is always private regardless of the body, which keeps one user's credentials from
  // reaching the whole instance; a create that does not say is private too, admin or not.
  const visibility =
    isAdmin && body.visibility !== undefined
      ? normaliseVisibility(body.visibility)
      : existing
        ? existing.visibility
        : VISIBILITY.PRIVATE;

  // Checked against the field bag that is actually about to be stored, so a value that falls back
  // to the stored one can never slip a privileged field past this guard.
  const guard = assertPrivilegedFieldsUnchanged(adapterId, fields, existing?.fields ?? {}, isAdmin);
  if (!guard.ok) {
    return fail('forbidden', privilegedFieldError(guard.adapterId, guard.field), { code: 'privilegedField' });
  }

  // A channel stored without its token saves cleanly and then notifies nobody, which is the worst
  // failure this app has. The web form checks the same before it sends; this is the server's copy.
  if (existing == null || body.fields !== undefined) {
    const missing = missingMandatoryFields(config, fields);
    if (missing.length > 0) {
      return fail('invalid', `A ${config.name} channel needs ${missing.map((key) => `"${key}"`).join(', ')}.`, {
        code: 'missingFields',
        missing,
      });
    }
  }

  const id = upsertChannel({
    id: existing?.id,
    userId: existing?.userId ?? user.id,
    adapterId,
    name,
    fields,
    visibility,
  });
  return { ok: true, channel: getChannel(id), created: existing == null, adapterConfig: config };
}

/**
 * Delete a channel, unless a job still sends through it.
 *
 * Deleting a channel out from under a job would leave that job quietly notifying nobody. The jobs
 * that block it come back on the refusal, so the caller can say which ones.
 *
 * @param {User} user
 * @param {string} channelId
 * @param {{dryRun?: boolean}} [options] - `dryRun` runs every check and deletes nothing, for a caller
 *   that asks for confirmation first and wants a refusal to come before the question.
 * @returns {ServiceFailure|{ok: true, channel: Channel}}
 */
export function deleteChannel(user, channelId, { dryRun = false } = {}) {
  const channel = getChannel(channelId);
  if (channel == null) return fail('notFound', 'Notification channel not found.');
  if (!canEditChannel(user, channel)) {
    return fail('forbidden', 'You are not allowed to delete this notification channel.');
  }
  const jobs = getJobsUsingChannel(channel.id);
  if (jobs.length > 0) {
    return fail(
      'conflict',
      `This notification channel is still used by ${jobs.map((job) => `"${job.name || job.id}"`).join(', ')}.`,
      { code: 'inUse', jobs },
    );
  }
  if (!dryRun) removeChannel(channel.id);
  return { ok: true, channel };
}

/**
 * Send one sample listing through a stored channel.
 *
 * The stored fields are used, never ones the caller supplies: the caller was never given the
 * secrets, and a test of values that are not stored would not test the channel.
 *
 * @param {User} user
 * @param {string} channelId
 * @returns {Promise<ServiceFailure|{ok: true, channel: Channel}>}
 */
export async function testChannel(user, channelId) {
  const channel = getChannel(channelId);
  if (channel == null) return fail('notFound', 'Notification channel not found.');
  if (!canUseChannel(user, channel)) {
    return fail('forbidden', 'You are not allowed to use this notification channel.');
  }
  const adapter = adapterOf(await getNotificationAdapters(), channel.adapterId);
  if (adapter == null) {
    return fail('notFound', 'Unknown notification type - the adapter was removed from this Fredy.', {
      code: 'unknownAdapter',
    });
  }
  try {
    await testFire(adapter, channel.fields, { userId: user.id });
  } catch (error) {
    logger.error('Error during notification channel test:', error);
    return fail('failed', `The test message could not be sent: ${error?.message ?? String(error)}`);
  }
  return { ok: true, channel };
}
