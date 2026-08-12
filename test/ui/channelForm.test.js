/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  emptyChannel,
  toCloneDraft,
  validateChannel,
  toPayload,
} from '../../ui/src/services/notificationChannels/channelForm.js';

const t = (key) => key;

const telegram = {
  id: 'telegram',
  name: 'Telegram',
  fields: {
    token: { type: 'text', label: 'Token', secret: true },
    chatId: { type: 'text', label: 'Chat Id', target: true },
    threadId: { type: 'text', label: 'Thread', optional: true },
    plainText: { type: 'boolean', label: 'Plain text' },
  },
};

describe('emptyChannel', () => {
  it('starts every declared field blank and the channel private', () => {
    expect(emptyChannel(telegram)).toEqual({
      id: null,
      adapterId: 'telegram',
      name: '',
      fields: { token: '', chatId: '', threadId: '', plainText: false },
      visibility: 'private',
    });
  });

  it('copes with an adapter that declares no fields', () => {
    expect(emptyChannel({ id: 'browser' })).toEqual({
      id: null,
      adapterId: 'browser',
      name: '',
      fields: {},
      visibility: 'private',
    });
  });
});

describe('toCloneDraft', () => {
  const channel = {
    id: 'c1',
    adapterId: 'telegram',
    name: 'Family chat',
    visibility: 'everyone',
    fields: { token: 'tok', chatId: '123', threadId: '', plainText: true },
  };

  it('drops the id so saving creates a new row', () => {
    expect(toCloneDraft(channel, { canRevealSecrets: true, adapterConfig: telegram }).id).toBeNull();
  });

  it('names the copy', () => {
    expect(toCloneDraft(channel, { canRevealSecrets: true, adapterConfig: telegram }).name).toBe('Family chat (copy)');
  });

  it('resets visibility to private - a clone is the cloner own channel', () => {
    expect(toCloneDraft(channel, { canRevealSecrets: true, adapterConfig: telegram }).visibility).toBe('private');
  });

  it('carries the secrets when the cloner may see them', () => {
    expect(toCloneDraft(channel, { canRevealSecrets: true, adapterConfig: telegram }).fields.token).toBe('tok');
  });

  it('blanks the secrets when the cloner may not, keeping the rest', () => {
    const draft = toCloneDraft(channel, { canRevealSecrets: false, adapterConfig: telegram });
    expect(draft.fields.token).toBe('');
    expect(draft.fields.chatId).toBe('123');
  });

  it('preserves a boolean field rather than coercing it to a string', () => {
    expect(toCloneDraft(channel, { canRevealSecrets: true, adapterConfig: telegram }).fields.plainText).toBe(true);
  });

  it('seeds a missing boolean as false, not as an empty string', () => {
    const bare = { adapterId: 'telegram', name: 'Bare', fields: {} };
    const draft = toCloneDraft(bare, { canRevealSecrets: true, adapterConfig: telegram });
    expect(draft.fields.plainText).toBe(false);
    expect(draft.fields.chatId).toBe('');
  });

  it('only emits keys the adapter declares, so a stale stored key cannot travel', () => {
    const stale = { adapterId: 'telegram', name: 'Stale', fields: { removedLongAgo: 'x', chatId: '1' } };
    const draft = toCloneDraft(stale, { canRevealSecrets: true, adapterConfig: telegram });
    expect(draft.fields).not.toHaveProperty('removedLongAgo');
  });
});

describe('validateChannel', () => {
  const valid = { name: 'Family', fields: { token: 'tok', chatId: '1', threadId: '', plainText: false } };

  it('passes a complete draft, and does not require the optional field', () => {
    expect(validateChannel(valid, telegram, t)).toEqual([]);
  });

  it('requires a name', () => {
    expect(validateChannel({ ...valid, name: '  ' }, telegram, t)).toEqual(['notification.channels.validationName']);
  });

  it('requires every non-optional field', () => {
    const draft = { ...valid, fields: { ...valid.fields, chatId: '' } };
    expect(validateChannel(draft, telegram, t)).toEqual(['notification.validationAllMandatory']);
  });

  it('does not require a boolean', () => {
    const config = { id: 'x', name: 'X', fields: { flag: { type: 'boolean', label: 'F' } } };
    expect(validateChannel({ name: 'X', fields: { flag: false } }, config, t)).toEqual([]);
  });

  it('rejects a negative number', () => {
    const config = { id: 'x', name: 'X', fields: { port: { type: 'number', label: 'Port' } } };
    expect(validateChannel({ name: 'X', fields: { port: '-1' } }, config, t)).toEqual([
      'notification.validationNumberField',
    ]);
  });

  it('accepts zero, which is a legitimate number', () => {
    const config = { id: 'x', name: 'X', fields: { port: { type: 'number', label: 'Port' } } };
    expect(validateChannel({ name: 'X', fields: { port: '0' } }, config, t)).toEqual([]);
  });

  it('reports each problem once, in a stable order', () => {
    const draft = { name: '', fields: { token: '', chatId: '', threadId: '', plainText: false } };
    expect(validateChannel(draft, telegram, t)).toEqual([
      'notification.channels.validationName',
      'notification.validationAllMandatory',
    ]);
  });
});

describe('toPayload', () => {
  it('trims the name and always sends fields and visibility', () => {
    const draft = {
      id: 'c1',
      adapterId: 'telegram',
      name: '  Family  ',
      visibility: 'everyone',
      fields: { token: 'tok', chatId: '1' },
    };
    expect(toPayload(draft)).toEqual({
      id: 'c1',
      adapterId: 'telegram',
      name: 'Family',
      visibility: 'everyone',
      fields: { token: 'tok', chatId: '1' },
    });
  });

  it('copies the field bag rather than aliasing the draft', () => {
    const draft = { id: null, adapterId: 't', name: 'n', visibility: 'private', fields: { a: '1' } };
    const payload = toPayload(draft);
    payload.fields.a = 'mutated';
    expect(draft.fields.a).toBe('1');
  });
});
