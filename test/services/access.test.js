/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { canAccessJob, canModifyJob, SHARED_WITH_USER_SQL } from '../../lib/services/security/access.js';

const owner = { id: 'u1', isAdmin: false };
const stranger = { id: 'u2', isAdmin: false };
const admin = { id: 'a1', isAdmin: true };

const job = (over = {}) => ({ userId: 'u1', shared_with_user: [], ...over });

describe('canAccessJob', () => {
  it('lets the owner see their job', () => {
    expect(canAccessJob(owner, job())).toBe(true);
  });

  it('keeps a stranger out', () => {
    expect(canAccessJob(stranger, job())).toBe(false);
  });

  it('lets a user the job was shared with see it', () => {
    expect(canAccessJob(stranger, job({ shared_with_user: ['u2'] }))).toBe(true);
  });

  it('lets an admin see anything', () => {
    expect(canAccessJob(admin, job())).toBe(true);
  });

  it('says no for a missing user or job', () => {
    expect(canAccessJob(null, job())).toBe(false);
    expect(canAccessJob(owner, null)).toBe(false);
  });
});

describe('canModifyJob', () => {
  it('is the owner and admins only - being shared a job does not make it yours', () => {
    expect(canModifyJob(owner, job())).toBe(true);
    expect(canModifyJob(admin, job())).toBe(true);
    expect(canModifyJob(stranger, job({ shared_with_user: ['u2'] }))).toBe(false);
  });
});

/**
 * Both ids are optional in these signatures and `undefined === undefined` is true, so an
 * unguarded ownership comparison hands a caller with a partial object the owner's rights.
 * Neither shape is reachable through the current call sites, which is why these are hardening
 * tests rather than a regression suite for a live bug.
 */
describe('ownership comparison never matches on absent ids', () => {
  const noId = { isAdmin: false };
  const noOwner = { shared_with_user: [] };

  it('does not treat a user without an id as the owner of a job without an owner', () => {
    expect(canAccessJob(noId, noOwner)).toBe(false);
    expect(canModifyJob(noId, noOwner)).toBe(false);
  });

  it('does not let a user without an id reach a job that has an owner', () => {
    expect(canAccessJob(noId, job())).toBe(false);
    expect(canModifyJob(noId, job())).toBe(false);
  });

  it('does not let a real user reach a job whose owner is undefined', () => {
    expect(canAccessJob(stranger, noOwner)).toBe(false);
    expect(canModifyJob(stranger, noOwner)).toBe(false);
  });

  it('still lets an admin through either way - the guard must not narrow the admin case', () => {
    expect(canAccessJob({ isAdmin: true }, noOwner)).toBe(true);
    expect(canModifyJob({ isAdmin: true }, noOwner)).toBe(true);
  });

  it('does not match a user without an id against a share list holding null', () => {
    expect(canAccessJob(noId, job({ userId: 'u1', shared_with_user: [null] }))).toBe(false);
  });
});

describe('SHARED_WITH_USER_SQL', () => {
  it('expresses the same rule set-wise, for the queries that filter rather than decide', () => {
    expect(SHARED_WITH_USER_SQL).toContain('j.user_id = @userId');
    expect(SHARED_WITH_USER_SQL).toContain('json_each(j.shared_with_user)');
  });
});
