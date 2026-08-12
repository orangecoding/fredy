/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_ENV_NAME = 'FREDY_MAIL_ENCRYPTION_KEY';
const VERSION = 'v1';

/**
 * Read the external encryption key used for mailbox credentials.
 *
 * The value may be 64 hexadecimal characters or base64-encoded 32 bytes.
 * Keeping it outside SQLite means a copied database or backup does not also
 * contain the material required to decrypt mailbox passwords.
 *
 * @returns {Buffer}
 * @throws {Error} when the key is missing or malformed.
 */
function getEncryptionKey() {
  const configured = process.env[KEY_ENV_NAME]?.trim();
  if (!configured) {
    throw new Error(`${KEY_ENV_NAME} must be configured before an IMAP account can be used.`);
  }

  const key = /^[a-f\d]{64}$/i.test(configured) ? Buffer.from(configured, 'hex') : Buffer.from(configured, 'base64');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV_NAME} must contain exactly 32 bytes (base64 or 64 hexadecimal characters).`);
  }
  return key;
}

/**
 * Encrypt a mailbox password using authenticated AES-256-GCM.
 *
 * @param {string} plaintext
 * @returns {string} Versioned base64url envelope.
 */
export function encryptMailCredential(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('An IMAP password is required.');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

/**
 * Decrypt a password written by {@link encryptMailCredential}.
 *
 * @param {string} envelope
 * @returns {string}
 */
export function decryptMailCredential(envelope) {
  const [version, ivValue, tagValue, encryptedValue, ...extra] = String(envelope ?? '').split('.');
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue || extra.length > 0) {
    throw new Error('The stored IMAP credential has an unsupported format.');
  }
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString(
      'utf8',
    );
  } catch (error) {
    throw new Error('The stored IMAP credential could not be decrypted.', { cause: error });
  }
}
