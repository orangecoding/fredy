/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The channel editor's state, kept out of the component so it can be tested without rendering.
 *
 * @typedef {Object} ChannelDraft
 * @property {string|null} id - null for create and for clone.
 * @property {string} adapterId
 * @property {string} name
 * @property {Record<string, any>} fields
 * @property {string} visibility
 */

/**
 * A blank draft for one adapter type.
 *
 * Every declared field is seeded, so the form is controlled from the first render and a boolean
 * never starts as `undefined`.
 *
 * @param {{id: string, fields?: Record<string, {type?: string}>}} adapterConfig
 * @returns {ChannelDraft}
 */
export function emptyChannel(adapterConfig) {
  const fields = {};
  for (const [key, definition] of Object.entries(adapterConfig?.fields ?? {})) {
    fields[key] = definition?.type === 'boolean' ? false : '';
  }
  return { id: null, adapterId: adapterConfig.id, name: '', fields, visibility: 'private' };
}

/**
 * Turn a loaded channel into a draft for a new copy of it.
 *
 * The copy always belongs to whoever made it and always starts private: cloning is how a user gets
 * their own variant of somebody else's channel, and inheriting `everyone` would re-share it on
 * their behalf. Secrets only come along when the server was willing to reveal them, which is the
 * same rule the editor uses.
 *
 * @param {{adapterId: string, name: string, fields?: Record<string, any>}} channel
 * @param {{canRevealSecrets: boolean, adapterConfig: {fields?: Record<string, {secret?: boolean, generated?: boolean, type?: string}>}}} options
 * @returns {ChannelDraft}
 */
export function toCloneDraft(channel, { canRevealSecrets, adapterConfig }) {
  const fields = {};
  for (const [key, definition] of Object.entries(adapterConfig?.fields ?? {})) {
    // A generated value (a feed token) belongs to the original channel. The server would replace it
    // anyway; blank, the form says so instead of showing the original's url as the copy's.
    if (definition?.generated === true || (definition?.secret === true && !canRevealSecrets)) {
      fields[key] = '';
      continue;
    }
    fields[key] = channel.fields?.[key] ?? (definition?.type === 'boolean' ? false : '');
  }
  return {
    id: null,
    adapterId: channel.adapterId,
    name: `${channel.name} (copy)`,
    fields,
    visibility: 'private',
  };
}

/**
 * Validate a draft. Returns translated messages, de-duplicated, in a stable order.
 *
 * @param {ChannelDraft} draft
 * @param {{fields?: Record<string, {type?: string, optional?: boolean, generated?: boolean}>}} adapterConfig
 * @param {(key: string) => string} t
 * @returns {string[]}
 */
export function validateChannel(draft, adapterConfig, t) {
  const messages = [];
  if (typeof draft?.name !== 'string' || draft.name.trim().length === 0) {
    messages.push(t('notification.channels.validationName'));
  }

  for (const [key, definition] of Object.entries(adapterConfig?.fields ?? {})) {
    const value = draft?.fields?.[key];
    // Fredy fills a generated field when the channel is saved, so it is empty on every new draft.
    if (definition?.type === 'boolean' || definition?.generated === true) continue;

    if (definition?.type === 'number' && value !== '' && value != null) {
      const parsed = parseFloat(value);
      if (Number.isNaN(parsed) || parsed < 0) {
        messages.push(t('notification.validationNumberField'));
        continue;
      }
    }
    if (definition?.optional === true) continue;
    if (value == null || String(value).trim().length === 0) {
      messages.push(t('notification.validationAllMandatory'));
    }
  }

  return [...new Set(messages)];
}

/**
 * Shape a draft for `POST /api/notificationChannels`.
 *
 * `fields` and `visibility` are always sent. The route treats an absent key as "keep what is
 * stored", so omitting them here would make an edit silently no-op instead of applying.
 *
 * @param {ChannelDraft} draft
 * @returns {{id: string|null, adapterId: string, name: string, fields: Record<string, any>, visibility: string}}
 */
export function toPayload(draft) {
  return {
    id: draft.id,
    adapterId: draft.adapterId,
    name: draft.name.trim(),
    fields: { ...draft.fields },
    visibility: draft.visibility,
  };
}
