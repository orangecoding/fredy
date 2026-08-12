/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { canUseChannel, canEditChannel } from '../../lib/services/security/channelAccess.js';

const owner = { id: 'u1', isAdmin: false };
const stranger = { id: 'u2', isAdmin: false };
const admin = { id: 'a1', isAdmin: true };
const channel = (visibility) => ({ id: 'c1', userId: 'u1', visibility });

describe('canUseChannel', () => {
  it('lets the owner use their own private channel', () => {
    expect(canUseChannel(owner, channel('private'))).toBe(true);
  });

  it('hides a private channel from everybody else', () => {
    expect(canUseChannel(stranger, channel('private'))).toBe(false);
  });

  it('lets an admin use anything', () => {
    expect(canUseChannel(admin, channel('private'))).toBe(true);
  });

  it('lets any user use an everyone channel', () => {
    expect(canUseChannel(stranger, channel('everyone'))).toBe(true);
  });

  it('keeps an admin channel away from a normal user', () => {
    expect(canUseChannel(stranger, channel('admin'))).toBe(false);
    expect(canUseChannel(admin, channel('admin'))).toBe(true);
  });

  it('says no for a missing user or channel', () => {
    expect(canUseChannel(null, channel('everyone'))).toBe(false);
    expect(canUseChannel(owner, null)).toBe(false);
  });

  it('denies access when both user.id and channel.userId are absent', () => {
    expect(canUseChannel({ isAdmin: false }, { visibility: 'private' })).toBe(false);
  });

  it('denies access when user.id is absent even if channel.userId exists', () => {
    expect(canUseChannel({ isAdmin: false }, { userId: 'u1', visibility: 'private' })).toBe(false);
  });

  it('denies access when channel.userId is absent even if user.id exists', () => {
    expect(canUseChannel({ id: 'u1', isAdmin: false }, { visibility: 'private' })).toBe(false);
  });

  it('allows everyone visibility even with missing ids', () => {
    expect(canUseChannel({ isAdmin: false }, { visibility: 'everyone' })).toBe(true);
  });

  it('always allows admins regardless of missing ids', () => {
    expect(canUseChannel({ isAdmin: true }, { visibility: 'private' })).toBe(true);
  });
});

describe('canEditChannel', () => {
  it('is the owner and admins only - being allowed to use it is not enough', () => {
    expect(canEditChannel(owner, channel('everyone'))).toBe(true);
    expect(canEditChannel(admin, channel('private'))).toBe(true);
    expect(canEditChannel(stranger, channel('everyone'))).toBe(false);
  });

  it('denies edit when both user.id and channel.userId are absent', () => {
    expect(canEditChannel({ isAdmin: false }, { visibility: 'private' })).toBe(false);
  });

  it('denies edit when user.id is absent even if channel.userId exists', () => {
    expect(canEditChannel({ isAdmin: false }, { userId: 'u1' })).toBe(false);
  });

  it('denies edit when channel.userId is absent even if user.id exists', () => {
    expect(canEditChannel({ id: 'u1', isAdmin: false }, {})).toBe(false);
  });

  it('always allows admins regardless of missing ids', () => {
    expect(canEditChannel({ isAdmin: true }, {})).toBe(true);
  });
});
