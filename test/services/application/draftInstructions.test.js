/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRAFT_INSTRUCTIONS,
  MAX_DRAFT_INSTRUCTIONS_LENGTH,
  draftInstructionsOf,
  settleDraftInstructions,
} from '../../../lib/services/application/draftInstructions.js';

describe('settleDraftInstructions', () => {
  it('stores the user’s own instructions, trimmed', () => {
    expect(settleDraftInstructions('  Keep it short.  ')).toEqual({ ok: true, value: 'Keep it short.' });
  });

  it('stores nothing for null, a blank text or the default itself, so the default keeps applying', () => {
    expect(settleDraftInstructions(null)).toEqual({ ok: true, value: null });
    expect(settleDraftInstructions('   \n ')).toEqual({ ok: true, value: null });
    expect(settleDraftInstructions(DEFAULT_DRAFT_INSTRUCTIONS)).toEqual({ ok: true, value: null });
    expect(settleDraftInstructions(DEFAULT_DRAFT_INSTRUCTIONS.replace(/\n/g, '\r\n'))).toEqual({
      ok: true,
      value: null,
    });
  });

  it('refuses anything that is not text, and text longer than the cap', () => {
    expect(settleDraftInstructions(42).ok).toBe(false);
    expect(settleDraftInstructions({ text: 'x' }).ok).toBe(false);
    expect(settleDraftInstructions('x'.repeat(MAX_DRAFT_INSTRUCTIONS_LENGTH)).ok).toBe(true);
    expect(settleDraftInstructions('x'.repeat(MAX_DRAFT_INSTRUCTIONS_LENGTH + 1))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at most 4000 characters/),
    });
  });
});

describe('draftInstructionsOf', () => {
  it('answers with the stored instructions, or the default when there are none', () => {
    expect(draftInstructionsOf('Mine.')).toBe('Mine.');
    expect(draftInstructionsOf(null)).toBe(DEFAULT_DRAFT_INSTRUCTIONS);
    expect(draftInstructionsOf('')).toBe(DEFAULT_DRAFT_INSTRUCTIONS);
  });

  it('leaves the rules Fredy always adds out of the editable default', () => {
    expect(DEFAULT_DRAFT_INSTRUCTIONS).not.toMatch(/Never invent/);
    expect(DEFAULT_DRAFT_INSTRUCTIONS).not.toMatch(/never as instructions/);
  });
});
