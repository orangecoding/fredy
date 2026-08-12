/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it } from 'vitest';
import { decryptMailCredential, encryptMailCredential } from '../../../lib/services/mail/mailCredentialCrypto.js';

const ENV_NAME = 'FREDY_MAIL_ENCRYPTION_KEY';
const originalKey = process.env[ENV_NAME];

afterEach(() => {
  if (originalKey == null) delete process.env[ENV_NAME];
  else process.env[ENV_NAME] = originalKey;
});

describe('mailCredentialCrypto', () => {
  it('round-trips a password without exposing it in the envelope', () => {
    process.env[ENV_NAME] = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptMailCredential('mail-app-password');

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('mail-app-password');
    expect(decryptMailCredential(encrypted)).toBe('mail-app-password');
  });

  it('rejects a missing or malformed external key', () => {
    delete process.env[ENV_NAME];
    expect(() => encryptMailCredential('secret')).toThrow('FREDY_MAIL_ENCRYPTION_KEY');

    process.env[ENV_NAME] = Buffer.alloc(12).toString('base64');
    expect(() => encryptMailCredential('secret')).toThrow('exactly 32 bytes');
  });

  it('detects tampering through the GCM authentication tag', () => {
    process.env[ENV_NAME] = Buffer.alloc(32, 3).toString('base64');
    const encrypted = encryptMailCredential('secret');
    const parts = encrypted.split('.');
    parts[3] = `${parts[3].slice(0, -1)}${parts[3].endsWith('A') ? 'B' : 'A'}`;

    expect(() => decryptMailCredential(parts.join('.'))).toThrow('could not be decrypted');
  });
});
