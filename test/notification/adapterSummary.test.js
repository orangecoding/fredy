/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { describeChannel, redactSecrets } from '../../lib/notification/adapterSummary.js';
import { getNotificationAdapters } from '../../lib/utils.js';

const telegramConfig = {
  id: 'telegram',
  name: 'Telegram',
  fields: {
    token: { type: 'text', label: 'Token', secret: true },
    chatId: { type: 'text', label: 'Chat Id', target: true },
    plainText: { type: 'boolean', label: 'Plain text' },
  },
};

describe('describeChannel', () => {
  it('uses the field marked as the target', () => {
    expect(describeChannel(telegramConfig, { token: 'tok', chatId: '123' })).toBe('123');
  });

  it('falls back to the first non-secret text field when no target is marked', () => {
    const config = { id: 'x', name: 'X', fields: { key: { type: 'text', secret: true }, host: { type: 'text' } } };
    expect(describeChannel(config, { key: 'sk-1', host: 'mail.example.com' })).toBe('mail.example.com');
  });

  it('never falls back to a secret', () => {
    const config = { id: 'x', name: 'X', fields: { key: { type: 'text', secret: true } } };
    expect(describeChannel(config, { key: 'sk-1' })).toBe('X');
  });

  it('never falls back to a boolean', () => {
    const config = { id: 'x', name: 'X', fields: { flag: { type: 'boolean' } } };
    expect(describeChannel(config, { flag: true })).toBe('X');
  });

  it('falls back to the adapter name when the target field is empty', () => {
    expect(describeChannel(telegramConfig, { token: 'tok', chatId: '' })).toBe('Telegram');
  });

  it('handles an adapter with no fields at all', () => {
    expect(describeChannel({ id: 'browser', name: 'Browser Notifications' }, {})).toBe('Browser Notifications');
  });

  it('returns null when the adapter is gone', () => {
    expect(describeChannel(null, { chatId: '1' })).toBeNull();
  });

  it('never returns a field marked both target and secret, even though it is the target', () => {
    const config = { id: 'x', name: 'X', fields: { apiKey: { type: 'text', target: true, secret: true } } };
    expect(describeChannel(config, { apiKey: 'sk-live-123' })).toBe('X');
  });

  it('falls back past a target-and-secret field to an ordinary field that has a value', () => {
    const config = {
      id: 'x',
      name: 'X',
      fields: {
        apiKey: { type: 'text', target: true, secret: true },
        host: { type: 'text' },
      },
    };
    expect(describeChannel(config, { apiKey: 'sk-live-123', host: 'mail.example.com' })).toBe('mail.example.com');
  });
});

describe('redactSecrets', () => {
  it('blanks secret fields and keeps the rest', () => {
    expect(redactSecrets(telegramConfig, { token: 'tok', chatId: '123' }, { reveal: false })).toEqual({
      token: '',
      chatId: '123',
      // A boolean that was never set comes back as `false`, not as the string ''.
      plainText: false,
    });
  });

  it('returns everything when revealing', () => {
    expect(redactSecrets(telegramConfig, { token: 'tok', chatId: '123' }, { reveal: true })).toMatchObject({
      token: 'tok',
      chatId: '123',
    });
  });

  it('only emits keys the adapter declares, so a stale stored key cannot leak', () => {
    const result = redactSecrets(telegramConfig, { token: 'tok', chatId: '1', removedLongAgo: 'x' }, { reveal: true });
    expect(result).not.toHaveProperty('removedLongAgo');
  });

  it('defaults an unset boolean to false rather than to an empty string', () => {
    const config = {
      id: 'x',
      name: 'X',
      fields: { flag: { type: 'boolean' }, note: { type: 'text' }, key: { type: 'boolean', secret: true } },
    };
    expect(redactSecrets(config, {}, { reveal: true })).toEqual({ flag: false, note: '', key: false });
    expect(redactSecrets(config, {}, { reveal: false })).toEqual({ flag: false, note: '', key: false });
  });

  it('keeps a boolean that was explicitly set', () => {
    const config = { id: 'x', name: 'X', fields: { flag: { type: 'boolean' } } };
    expect(redactSecrets(config, { flag: true }, { reveal: true })).toEqual({ flag: true });
    expect(redactSecrets(config, { flag: false }, { reveal: true })).toEqual({ flag: false });
  });

  it('returns an empty bag for an unknown adapter', () => {
    expect(redactSecrets(null, { token: 'tok' }, { reveal: true })).toEqual({});
  });
});

describe('shipped adapters declare their metadata', () => {
  const EXPECTED_SECRETS = {
    discord_webhook: ['webhookUrl'],
    http: ['authToken'],
    mailjet: ['apiPublicKey', 'apiPrivateKey'],
    mattermost: ['webhook'],
    ntfy: ['accessToken', 'password', 'topic'],
    pushover: ['token', 'user'],
    resend: ['apiKey'],
    sendgrid: ['apiKey'],
    slack: ['token'],
    slack_with_webhooks: ['webhookUrl'],
    smtp: ['password'],
    telegram: ['token'],
  };

  const EXPECTED_TARGETS = {
    apprise: 'server',
    http: 'endpointUrl',
    mailjet: 'receiver',
    mattermost: 'channel',
    ntfy: 'server',
    pushover: 'device',
    resend: 'receiver',
    sendgrid: 'receiver',
    slack: 'channel',
    smtp: 'receiver',
    sqlite: 'dbPath',
    telegram: 'chatId',
  };

  it('marks every credential as secret', async () => {
    const adapters = await getNotificationAdapters();
    for (const [adapterId, keys] of Object.entries(EXPECTED_SECRETS)) {
      const config = adapters.find((a) => a.config?.id === adapterId)?.config;
      expect(config, `adapter ${adapterId} is missing`).toBeTruthy();
      const marked = Object.entries(config.fields || {})
        .filter(([, def]) => def.secret === true)
        .map(([key]) => key)
        .sort();
      expect(marked, `adapter ${adapterId}`).toEqual([...keys].sort());
    }
  });

  it('marks exactly one target field per adapter that has one', async () => {
    const adapters = await getNotificationAdapters();
    for (const [adapterId, key] of Object.entries(EXPECTED_TARGETS)) {
      const config = adapters.find((a) => a.config?.id === adapterId)?.config;
      expect(config, `adapter ${adapterId} is missing`).toBeTruthy();
      const marked = Object.entries(config.fields || {})
        .filter(([, def]) => def.target === true)
        .map(([k]) => k);
      expect(marked, `adapter ${adapterId}`).toEqual([key]);
    }
  });
});
