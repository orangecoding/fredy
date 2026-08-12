/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { toChannelRefs } from '../../lib/api/routes/jobRouter.js';

/**
 * The client sends whatever its picker produced. The route pins that down to one shape before it
 * is authorised and stored, so the authorisation check and the stored value cannot disagree.
 */
describe('toChannelRefs', () => {
  it('accepts the reference objects the UI sends', () => {
    expect(toChannelRefs([{ configuredAdapterId: 'a' }, { configuredAdapterId: 'b' }])).toEqual(['a', 'b']);
  });

  it('accepts bare ids', () => {
    expect(toChannelRefs(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('drops duplicates so a job cannot notify the same channel twice', () => {
    expect(toChannelRefs(['a', { configuredAdapterId: 'a' }])).toEqual(['a']);
  });

  it('drops entries with no usable id', () => {
    expect(toChannelRefs([null, {}, { configuredAdapterId: '' }, 42, 'a'])).toEqual(['a']);
  });

  it('returns an empty list for a non-array', () => {
    expect(toChannelRefs(undefined)).toEqual([]);
    expect(toChannelRefs('a')).toEqual([]);
  });

  it('ignores the legacy inline shape rather than storing it', () => {
    expect(toChannelRefs([{ id: 'telegram', fields: { token: 'tok' } }])).toEqual([]);
  });
});
