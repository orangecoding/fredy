/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_RESET_CODE_ATTEMPTS,
  RESET_CODE_TTL_MS,
  clearResetCode,
  issueResetCode,
  matchesResetCode,
} from '../../lib/services/security/passwordResetCode.js';

const NOW = 1_700_000_000_000;

beforeEach(() => {
  clearResetCode();
});

describe('issueResetCode', () => {
  it('hands out an eight character code without look-alike characters, valid for three minutes', () => {
    const { code, expiresAt } = issueResetCode(NOW);

    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(expiresAt).toBe(NOW + RESET_CODE_TTL_MS);
  });

  // Anyone who reaches the login screen can ask. A new code per click would let them flood the log
  // and keep replacing the code the admin is about to type.
  it('writes nothing new while a code is live, and reports when the live one runs out', () => {
    const first = issueResetCode(NOW);

    const second = issueResetCode(NOW + 60_000);

    expect(second).toEqual({ code: null, expiresAt: first.expiresAt, exhausted: false });
    expect(matchesResetCode(first.code, NOW + 60_000)).toBe(true);
  });

  it('hands out a new code once the old one ran out', () => {
    issueResetCode(NOW);

    const later = issueResetCode(NOW + RESET_CODE_TTL_MS);

    expect(later.code).not.toBeNull();
    expect(later.expiresAt).toBe(NOW + 2 * RESET_CODE_TTL_MS);
  });
});

describe('matchesResetCode', () => {
  it('accepts the code regardless of case, dash or spaces', () => {
    const { code } = issueResetCode(NOW);
    const plain = code.replace('-', '');

    expect(matchesResetCode(code, NOW)).toBe(true);
    expect(matchesResetCode(plain.toLowerCase(), NOW)).toBe(true);
    expect(matchesResetCode(` ${plain.slice(0, 4)} ${plain.slice(4)} `, NOW)).toBe(true);
  });

  it('does not use the code up, so a mistyped user name can be tried again', () => {
    const { code } = issueResetCode(NOW);

    matchesResetCode(code, NOW);

    expect(matchesResetCode(code, NOW)).toBe(true);
  });

  it('refuses a code that ran out', () => {
    const { code } = issueResetCode(NOW);

    expect(matchesResetCode(code, NOW + RESET_CODE_TTL_MS)).toBe(false);
  });

  it('refuses anything when no code was issued', () => {
    expect(matchesResetCode('ABCD-EFGH', NOW)).toBe(false);
    expect(matchesResetCode(undefined, NOW)).toBe(false);
  });

  it(`kills the code after ${MAX_RESET_CODE_ATTEMPTS} wrong guesses`, () => {
    const { code } = issueResetCode(NOW);
    for (let i = 0; i < MAX_RESET_CODE_ATTEMPTS - 1; i++) {
      expect(matchesResetCode('WRONG-CODE', NOW)).toBe(false);
    }
    expect(matchesResetCode(code, NOW)).toBe(true);

    expect(matchesResetCode('WRONG-CODE', NOW)).toBe(false);

    expect(matchesResetCode(code, NOW)).toBe(false);
  });

  // The next code at once would make five guesses per code worthless as a limit: kill one, ask for
  // the next, as fast as requests go, each one another line in the log.
  it('hands out no new code until the killed one would have run out', () => {
    const first = issueResetCode(NOW);
    for (let i = 0; i < MAX_RESET_CODE_ATTEMPTS; i++) {
      matchesResetCode('WRONG-CODE', NOW);
    }

    expect(issueResetCode(NOW + 1)).toEqual({ code: null, expiresAt: first.expiresAt, exhausted: true });
    expect(issueResetCode(NOW + RESET_CODE_TTL_MS - 1).code).toBeNull();

    const next = issueResetCode(NOW + RESET_CODE_TTL_MS);
    expect(next.code).not.toBeNull();
    expect(next.exhausted).toBe(false);
    expect(matchesResetCode(next.code, NOW + RESET_CODE_TTL_MS)).toBe(true);
  });

  it('hands out a new code at once after a successful reset used the old one up', () => {
    issueResetCode(NOW);
    clearResetCode();

    expect(issueResetCode(NOW + 1).code).not.toBeNull();
  });
});

describe('clearResetCode', () => {
  it('uses the code up', () => {
    const { code } = issueResetCode(NOW);

    clearResetCode();

    expect(matchesResetCode(code, NOW)).toBe(false);
  });
});
