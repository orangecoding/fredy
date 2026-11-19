/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';

/**
 * The one-time code behind "Forgot password?" on the login screen.
 *
 * Fredy knows no e-mail address or phone number of its users, so there is nothing to send a reset
 * link to. What proves the right to reset instead is access to the server: the code is written to
 * Fredy's console, and only someone who can read the terminal Fredy runs in (or `docker logs`) can
 * type it back. That is the same person who could open the database anyway.
 *
 * There is exactly one code at a time, for every account, held in memory only. It never reaches the
 * database, a backup or the debug bundle, and a restart throws it away. It dies on the first of:
 * a successful reset, {@link RESET_CODE_TTL_MS}, or {@link MAX_RESET_CODE_ATTEMPTS} wrong guesses.
 *
 * A code that was guessed to death is not replaced before it would have run out anyway. That, and
 * nothing counted per address, is what bounds guessing and log lines: at most one code and
 * {@link MAX_RESET_CODE_ATTEMPTS} guesses per {@link RESET_CODE_TTL_MS}, for everybody together.
 * An address is whatever `X-Forwarded-For` says while `trustProxy` is on, so a limit per address
 * stops nobody who wants past it, and behind a proxy that sends no such header it locks out
 * everyone at once.
 */

/** How long a code stays valid. */
export const RESET_CODE_TTL_MS = 3 * 60 * 1000;

/**
 * Wrong guesses a code survives. Counted for the code, not per address: there is one code for
 * everybody, so guesses spread over many addresses all go against the same secret.
 */
export const MAX_RESET_CODE_ATTEMPTS = 5;

/**
 * No 0/O, 1/I/L: the code is read off a terminal and typed by hand. 31 symbols, so eight of them
 * are about 39 bits, against at most five guesses per code.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/**
 * @typedef {Object} ActiveCode
 * @property {string} code - The normalised code, without the separator.
 * @property {number} expiresAt - Epoch milliseconds.
 * @property {number} failures - Wrong guesses so far.
 */

/** @type {ActiveCode|null} */
let active = null;

/**
 * Drop separators and case, so `abcd efgh`, `ABCD-EFGH` and `abcdefgh` are the same code.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalise(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
}

/**
 * @param {number} now
 * @returns {ActiveCode|null} The current code, guessed to death or not, or null when there is none
 *   or it ran out.
 */
function currentCode(now) {
  if (active != null && now >= active.expiresAt) {
    active = null;
  }
  return active;
}

/**
 * @param {ActiveCode} current
 * @returns {boolean} True when the code took its last wrong guess and accepts nothing any more.
 */
function isExhausted(current) {
  return current.failures >= MAX_RESET_CODE_ATTEMPTS;
}

/**
 * Create a code, unless one is still live or was guessed to death and has not run out yet.
 *
 * A request while a code is live hands out nothing new and prints nothing: anyone who can reach
 * the login screen can ask, and a fresh code per click would let them flood the log and keep
 * replacing the code the admin is about to type. The live code is not tied to whoever asked for
 * it, so the admin can use one that somebody else triggered.
 *
 * A code killed by wrong guesses keeps its place until it would have run out. Handing out the next
 * one at once let anybody cycle through codes as fast as they could send requests, each one a log
 * line and five more guesses.
 *
 * @param {number} [now=Date.now()]
 * @returns {{ code: string|null, expiresAt: number, exhausted: boolean }} `code` is the new code
 *   formatted as `ABCD-EFGH` for printing, or null when one already exists. `exhausted` says that
 *   one was guessed to death, and `expiresAt` then is when a new code can be asked for.
 */
export function issueResetCode(now = Date.now()) {
  const current = currentCode(now);
  if (current != null) {
    return { code: null, expiresAt: current.expiresAt, exhausted: isExhausted(current) };
  }
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  active = { code, expiresAt: now + RESET_CODE_TTL_MS, failures: 0 };
  return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: active.expiresAt, exhausted: false };
}

/**
 * Check a typed code against the live one, counting a wrong guess.
 *
 * Does not use the code up, so a right code with a mistyped user name can be tried again. The
 * caller has to call {@link clearResetCode} in the same synchronous run as a successful check,
 * before anything awaits, or two requests could both pass with the same code.
 *
 * @param {unknown} candidate - What the user typed.
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function matchesResetCode(candidate, now = Date.now()) {
  const current = currentCode(now);
  if (current == null || isExhausted(current)) return false;
  const typed = Buffer.from(normalise(candidate));
  const expected = Buffer.from(current.code);
  if (typed.length === expected.length && crypto.timingSafeEqual(typed, expected)) {
    return true;
  }
  current.failures += 1;
  return false;
}

/**
 * Use up the live code, after a successful reset (and between tests).
 *
 * @returns {void}
 */
export function clearResetCode() {
  active = null;
}
