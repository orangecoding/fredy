/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { hash, verify, needsRehash } from '../../lib/services/security/hash.js';

describe('password hashing (CWE-328)', () => {
  it('produces salted hashes: two hashes of the same password differ', async () => {
    const a = await hash('correcthorsebatterystaple');
    const b = await hash('correcthorsebatterystaple');
    expect(a).not.toEqual(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(b.startsWith('scrypt$')).toBe(true);
  });

  it('does NOT produce an unsalted SHA-256 hex digest', async () => {
    const password = 'admin';
    const sha = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
    const stored = await hash(password);
    // The stored form must not equal a plain, rainbow-tableable SHA-256 of the password.
    expect(stored).not.toEqual(sha);
    expect(/^[0-9a-f]{64}$/i.test(stored)).toBe(false);
  });

  it('verify() accepts the correct password and rejects wrong ones', async () => {
    const stored = await hash('s3cret!');
    expect(await verify('s3cret!', stored)).toBe(true);
    expect(await verify('wrong', stored)).toBe(false);
    expect(await verify('', stored)).toBe(false);
  });

  it('verify() still accepts legacy unsalted SHA-256 digests (migration path)', async () => {
    const password = 'legacy-user-password';
    const legacy = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
    expect(await verify(password, legacy)).toBe(true);
    expect(await verify('nope', legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('needsRehash() is false for a freshly produced hash', async () => {
    const stored = await hash('anything');
    expect(needsRehash(stored)).toBe(false);
  });

  it('verify() safely rejects malformed stored values', async () => {
    expect(await verify('x', null)).toBe(false);
    expect(await verify('x', '')).toBe(false);
    expect(await verify('x', 'scrypt$notenoughfields')).toBe(false);
    expect(await verify('x', 'scrypt$32768$8$1$zz$zz')).toBe(false);
  });
});
