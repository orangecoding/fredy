/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

const CONFIGURED = { llmEnabled: true, llmBaseUrl: 'https://llm.example/v1', llmModel: 'gpt-test', llmApiKey: '' };
const NAMED = { applicant_profile: { firstName: 'Max', lastName: 'Mustermann' } };

let globalSettings;
let userSettings;
let storedListing;
let letterLanguages;
const setApplicationDraft = vi.fn();

/**
 * Load the service with storage and the letter builder replaced. The endpoint itself is answered
 * through the `fetchFn` each test passes.
 *
 * @returns {Promise<typeof import('../../../lib/services/application/applicationDraftService.js')>}
 */
async function loadService() {
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => globalSettings,
    getUserSettings: () => userSettings,
  }));
  vi.doMock(root + '/lib/services/storage/listingsStorage.js', () => ({
    getListingById: vi.fn((id, userId) => (id === storedListing?.id && userId === 'u1' ? storedListing : null)),
    setApplicationDraft,
  }));
  vi.doMock(root + '/lib/services/application/applicationService.js', () => ({
    APPLICANT_PROFILE_SETTING: 'applicant_profile',
    buildApplicationLetter: async (listing, userId, { language } = {}) => {
      letterLanguages.push(language ?? null);
      return { text: 'Name: Max Mustermann', language: language ?? 'de', dealType: 'rent' };
    },
  }));
  vi.doMock(root + '/lib/services/logger.js', () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  return import(root + '/lib/services/application/applicationDraftService.js');
}

/**
 * A chat completions endpoint answering `content`.
 *
 * @param {string} content
 * @returns {import('vitest').Mock}
 */
const endpoint = (content) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  }));

const USER = { id: 'u1', isAdmin: false };

beforeEach(() => {
  globalSettings = CONFIGURED;
  userSettings = NAMED;
  storedListing = { id: 'l1', title: 'Helle Wohnung', provider: 'immoscout', dealType: 'rent' };
  letterLanguages = [];
  setApplicationDraft.mockClear();
});

describe('writeApplicationDraft', () => {
  it('writes the draft from the caller’s own letter and stores it on the listing', async () => {
    const { writeApplicationDraft } = await loadService();
    const fetchFn = endpoint('Guten Tag, ich interessiere mich für die Wohnung.');

    const written = await writeApplicationDraft(USER, 'l1', { fetchFn });

    expect(written).toMatchObject({
      ok: true,
      reused: false,
      draft: { text: 'Guten Tag, ich interessiere mich für die Wohnung.', model: 'gpt-test' },
    });
    expect(setApplicationDraft).toHaveBeenCalledWith('l1', written.draft);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('writes in the language the caller picked', async () => {
    const { writeApplicationDraft } = await loadService();

    await writeApplicationDraft(USER, 'l1', { language: 'en', fetchFn: endpoint('Hello') });

    expect(letterLanguages).toEqual(['en']);
  });

  it('answers with the stored draft and asks nothing when it is not told to rewrite', async () => {
    storedListing = {
      ...storedListing,
      application_draft: 'Already written.',
      application_draft_model: 'old-model',
      application_draft_generated_at: 1700000000000,
    };
    const { writeApplicationDraft } = await loadService();
    const fetchFn = endpoint('A new one');

    const written = await writeApplicationDraft(USER, 'l1', { rewrite: false, fetchFn });

    expect(written).toMatchObject({ ok: true, reused: true, draft: { text: 'Already written.', model: 'old-model' } });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(setApplicationDraft).not.toHaveBeenCalled();
  });

  it('replaces a stored draft when asked to', async () => {
    storedListing = { ...storedListing, application_draft: 'Already written.' };
    const { writeApplicationDraft } = await loadService();

    const written = await writeApplicationDraft(USER, 'l1', { fetchFn: endpoint('A new one') });

    expect(written).toMatchObject({ ok: true, reused: false, draft: { text: 'A new one' } });
  });

  it('refuses while drafts are not set up, without a request', async () => {
    globalSettings = { ...CONFIGURED, llmEnabled: false };
    const { writeApplicationDraft } = await loadService();
    const fetchFn = endpoint('x');

    const written = await writeApplicationDraft(USER, 'l1', { fetchFn });

    expect(written).toMatchObject({ ok: false, reason: 'unavailable', code: 'notConfigured' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a listing the caller cannot see', async () => {
    const { writeApplicationDraft } = await loadService();

    const written = await writeApplicationDraft({ id: 'someone-else' }, 'l1', { fetchFn: endpoint('x') });

    expect(written).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('refuses while the caller’s applicant profile names nobody', async () => {
    userSettings = { applicant_profile: { smoker: false } };
    const { writeApplicationDraft } = await loadService();
    const fetchFn = endpoint('x');

    const written = await writeApplicationDraft(USER, 'l1', { fetchFn });

    expect(written).toMatchObject({ ok: false, reason: 'invalid', code: 'noProfileName' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('says why when the endpoint fails, and stores nothing', async () => {
    const { writeApplicationDraft } = await loadService();
    const fetchFn = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid api key' }));

    const written = await writeApplicationDraft(USER, 'l1', { fetchFn });

    expect(written.ok).toBe(false);
    expect(written.reason).toBe('failed');
    expect(written.error).toMatch(/401/);
    expect(setApplicationDraft).not.toHaveBeenCalled();
  });
});

describe('describeAiDraft', () => {
  it('reports whether drafts can be written here, and the stored one', async () => {
    storedListing = { ...storedListing, application_draft: '  Stored.  ', application_draft_model: 'm' };
    const { describeAiDraft } = await loadService();

    expect(await describeAiDraft(storedListing)).toEqual({
      available: true,
      draft: { text: 'Stored.', model: 'm', generatedAt: null },
    });
  });

  it('is not available without a model, and has no draft on a listing without one', async () => {
    globalSettings = { ...CONFIGURED, llmModel: '' };
    const { describeAiDraft } = await loadService();

    expect(await describeAiDraft(storedListing)).toEqual({ available: false, draft: null });
  });
});
