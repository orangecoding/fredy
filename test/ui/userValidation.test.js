/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { userProblems, canSaveUser, problemOn } from '../../ui/src/services/users/userValidation.js';

const complete = (overrides = {}) => ({
  username: 'kim',
  password: 'correct horse',
  password2: 'correct horse',
  mode: 'create',
  ...overrides,
});

describe('userValidation', () => {
  it('lets a complete new account through', () => {
    expect(userProblems(complete())).toEqual([]);
    expect(canSaveUser(complete())).toBe(true);
  });

  it('is the point of the whole plan: an edit needs no password', () => {
    const draft = complete({ mode: 'edit', password: '', password2: '' });
    expect(userProblems(draft)).toEqual([]);
    expect(canSaveUser(draft)).toBe(true);
  });

  it('still wants one for a new account', () => {
    const problems = userProblems(complete({ password: '', password2: '' }));
    expect(problems.map((problem) => problem.key)).toEqual(['passwordMissing']);
  });

  it('catches a mismatch in both modes', () => {
    for (const mode of ['create', 'edit']) {
      const problems = userProblems(complete({ mode, password: 'a', password2: 'b' }));
      expect(
        problems.map((problem) => problem.key),
        mode,
      ).toContain('passwordMismatch');
      expect(problemOn(problems, 'password2'), mode).toBeDefined();
    }
  });

  it('does not accept a name made of whitespace', () => {
    expect(canSaveUser(complete({ username: '   ' }))).toBe(false);
  });

  it('survives being handed nothing', () => {
    expect(canSaveUser(undefined)).toBe(false);
    expect(canSaveUser({})).toBe(false);
  });

  it('reports the username and the mismatch together rather than one at a time', () => {
    const problems = userProblems({ username: '', password: 'a', password2: 'b', mode: 'edit' });
    expect(problems.map((problem) => problem.key)).toEqual(['usernameMissing', 'passwordMismatch']);
  });
});
