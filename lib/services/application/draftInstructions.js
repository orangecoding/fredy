/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The part of the AI draft prompt a user may rewrite: how the message is built, what it stresses,
 * how long it is and in which tone. The rules that keep a draft honest and safe are not part of it;
 * `buildLlmPrompt` in `llmDraft.js` adds them to whatever is stored here.
 *
 * Kept free of imports on purpose: the settings service checks a save against these rules, and it
 * must not pull in the HTTP client and the letter builder the draft generator needs.
 */

/** The user setting the instructions are stored under. Absent or null means the default. */
export const APPLICATION_DRAFT_INSTRUCTIONS_SETTING = 'application_draft_instructions';

/**
 * Longest instructions a user may store. They go into every request the user's drafts make, so a
 * long text is paid for on every listing; this is roomy for a page of instructions and no more.
 */
export const MAX_DRAFT_INSTRUCTIONS_LENGTH = 4000;

/**
 * What a draft is written by when the user has not written their own instructions.
 *
 * The order is the point. Handed a filled-in letter and asked to "adapt" it, a model returns the
 * letter nearly word for word, which is what the "Copy application" button gives already. So the
 * model is told to read the advert first and choose what to answer, and the letter is demoted to
 * the source of facts about the applicant.
 */
export const DEFAULT_DRAFT_INSTRUCTIONS = [
  '1. Read the listing and the description first. Pick the one to three things that matter most ' +
    'about this particular home: what the advertiser stresses, what stands out about it, and ' +
    'anything they ask applicants to tell them.',
  "2. Open with the salutation the applicant's letter uses. Then say in a sentence or two which of " +
    'those details appeal, referring to them naturally. The message must read as written for this ' +
    'advert, not as a form letter.',
  '3. Introduce the applicant with the facts a landlord or seller decides on: who would move in, ' +
    'occupation and employment, income, when they could move in, and whatever else their letter ' +
    'states that this advert cares about.',
  "4. If the advertiser asks for something specific, answer it when the applicant's letter covers it.",
  "5. Ask for a viewing, and close with a sign-off and the applicant's name and contact details.",
  '',
  "Use the applicant's letter for its facts only. Do not copy its layout or its list of details. " +
    'Write in the formal register used with a stranger, in about 120 to 200 words and short paragraphs.',
].join('\n');

/**
 * Settle what a save of the instructions stores.
 *
 * Empty, blank or the default itself store nothing (`null`), so a user who never changed them, or
 * reset them, follows the default when a later version of Fredy improves it.
 *
 * @param {unknown} value What the caller sent; `null` resets to the default.
 * @returns {{ok: true, value: string|null}|{ok: false, error: string}}
 */
export function settleDraftInstructions(value) {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, error: 'The AI draft instructions must be a string or null.' };
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  if (trimmed.length > MAX_DRAFT_INSTRUCTIONS_LENGTH) {
    return {
      ok: false,
      error: `The AI draft instructions may be at most ${MAX_DRAFT_INSTRUCTIONS_LENGTH} characters long.`,
    };
  }
  if (trimmed.length === 0 || trimmed === DEFAULT_DRAFT_INSTRUCTIONS) return { ok: true, value: null };
  return { ok: true, value: trimmed };
}

/**
 * The instructions a user's drafts are written by: their own, or the default.
 *
 * @param {unknown} stored The stored setting.
 * @returns {string}
 */
export function draftInstructionsOf(stored) {
  return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : DEFAULT_DRAFT_INSTRUCTIONS;
}
