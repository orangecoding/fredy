/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fetch from 'node-fetch';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification, reset as resetNotifications } from './mocks/mockNotification.js';
import { buildApplicationLetter } from '../lib/services/application/applicationService.js';

// The LLM endpoint is the network call these tests are about, so it is the one thing answered here.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
// The letter itself has tests of its own. What matters here is what the pipeline hands it.
vi.mock('../lib/services/application/applicationService.js', () => ({
  APPLICANT_PROFILE_SETTING: 'applicant_profile',
  buildApplicationLetter: vi.fn(async (listing) => ({
    text: 'Dear landlord, we would love to rent this flat.',
    language: 'de',
    dealType: listing?.dealType === 'buy' ? 'buy' : 'rent',
  })),
}));
vi.mock('../lib/services/listings/travelTimeSweeper.js', () => ({
  updateTravelTimesForListings: async () => {},
}));

const CONFIGURED = { llmEnabled: true, llmBaseUrl: 'http://llm.local/v1/', llmModel: 'test-model' };
/** The job owner's settings: drafts are only written for an applicant with a name. */
const NAMED_OWNER = { applicant_profile: { firstName: 'Max', lastName: 'Mustermann' } };
const TELEGRAM = [{ id: 'telegram', name: 'Phone', fields: {} }];
const MAIL = [{ id: 'mailjet', name: 'Inbox', fields: {} }];

/**
 * The requests that went to the LLM endpoint, leaving out anything else that may use fetch.
 *
 * @returns {Array<[string, Object]>}
 */
function llmCalls() {
  return fetch.mock.calls.filter(([url]) => String(url).endsWith('/chat/completions'));
}

/**
 * A listing as the test provider returns it.
 *
 * @param {string} id
 * @returns {Object}
 */
function scraped(id) {
  return { id, title: `Flat ${id}`, address: 'Hauptstr. 1, Berlin', price: '900', link: `http://example.com/${id}` };
}

/**
 * A chat completions answer carrying `content`.
 *
 * @param {string} content
 * @returns {Object}
 */
function completion(content) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
}

/**
 * Runs one job over the given listings and answers with what reached the notification.
 *
 * @param {Object} params
 * @param {string} params.providerId - Unique per test; the mock store keys its "already seen" set on it.
 * @param {Array<{id: string}>|null} [params.channels] - The job's notification channels.
 * @param {boolean} [params.applicationDrafts] - The job's own switch.
 * @param {'rent'|'buy'} [params.dealType]
 * @param {string[]} [params.ids] - Listing ids the provider returns.
 * @returns {Promise<Object[]>}
 */
async function notifiedListings({
  providerId,
  channels = TELEGRAM,
  applicationDrafts = true,
  dealType = 'rent',
  ids = ['a'],
}) {
  const Fredy = await mockFredy();
  const fredy = new Fredy(
    {
      url: 'http://example.com',
      getListings: () => Promise.resolve(ids.map(scraped)),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    },
    {
      id: `job-${providerId}`,
      notificationAdapter: channels,
      specFilter: null,
      spatialFilter: null,
      dealType,
      applicationDrafts,
    },
    providerId,
    { checkAndAddEntry: () => false },
    undefined,
  );
  await fredy.execute();
  return getLastNotification()?.payload ?? [];
}

describe('AI application drafts in the pipeline', () => {
  beforeEach(() => {
    resetNotifications();
    mockStore.storedApplicationDrafts.length = 0;
    fetch.mockReset();
    buildApplicationLetter.mockClear();
    mockStore.setUserSettings(NAMED_OWNER);
  });

  afterEach(() => {
    mockStore.setGlobalSettings(null);
    mockStore.setUserSettings(null);
  });

  it('puts the draft on the notified listing and stores it', async () => {
    mockStore.setGlobalSettings(CONFIGURED);
    fetch.mockResolvedValue(completion('Hello, I would like to view the flat.'));

    const [listing] = await notifiedListings({ providerId: 'drafts-happy' });

    expect(listing.applicationDraft).toBe('Hello, I would like to view the flat.');
    expect(listing.applicationDraftModel).toBe('test-model');
    expect(mockStore.storedApplicationDrafts).toHaveLength(1);
    expect(mockStore.storedApplicationDrafts[0]).toMatchObject({
      listingId: 'a',
      draft: { text: 'Hello, I would like to view the flat.', model: 'test-model' },
    });
    const [url, request] = llmCalls()[0];
    expect(url).toBe('http://llm.local/v1/chat/completions');
    // No key stored: a local server answers without one, and none is sent.
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it("writes the letter for the run's provider and the job's deal type", async () => {
    mockStore.setGlobalSettings(CONFIGURED);
    fetch.mockResolvedValue(completion('A purchase enquiry.'));

    await notifiedListings({ providerId: 'drafts-deal-type', dealType: 'buy' });

    const [listingForLetter, userId] = buildApplicationLetter.mock.calls[0];
    expect(listingForLetter).toMatchObject({ provider: 'drafts-deal-type', dealType: 'buy' });
    expect(userId).toBe('user1');
    expect(JSON.parse(llmCalls()[0][1].body).messages[0].content).toMatch(/purchase enquiry/);
  });

  it('drafts ten listings of a large run and notifies every one of them', async () => {
    mockStore.setGlobalSettings(CONFIGURED);
    fetch.mockResolvedValue(completion('Hello.'));
    const ids = Array.from({ length: 14 }, (_, i) => `big-${i}`);

    const notified = await notifiedListings({ providerId: 'drafts-capped', ids });

    expect(notified).toHaveLength(14);
    expect(llmCalls()).toHaveLength(10);
    expect(notified.filter((listing) => listing.applicationDraft === 'Hello.')).toHaveLength(10);
    expect(mockStore.storedApplicationDrafts).toHaveLength(10);
  });

  it('asks nothing while drafts are switched off', async () => {
    mockStore.setGlobalSettings({ ...CONFIGURED, llmEnabled: false });

    const [listing] = await notifiedListings({ providerId: 'drafts-off' });

    expect(llmCalls()).toHaveLength(0);
    expect(listing).not.toHaveProperty('applicationDraft');
  });

  it('asks nothing for a job that has drafts switched off, even with the instance switch on', async () => {
    mockStore.setGlobalSettings(CONFIGURED);

    const [listing] = await notifiedListings({ providerId: 'drafts-job-off', applicationDrafts: false });

    expect(llmCalls()).toHaveLength(0);
    expect(listing).not.toHaveProperty('applicationDraft');
  });

  it("writes drafts whatever the job's channel is, since the draft belongs to the listing", async () => {
    mockStore.setGlobalSettings(CONFIGURED);
    fetch.mockResolvedValue(completion('Hello from an email job.'));

    const [listing] = await notifiedListings({ providerId: 'drafts-mail', channels: MAIL });

    expect(llmCalls()).toHaveLength(1);
    expect(listing.applicationDraft).toBe('Hello from an email job.');
    expect(mockStore.storedApplicationDrafts).toHaveLength(1);
  });

  it("asks nothing while the owner's applicant profile has no name, and still notifies", async () => {
    mockStore.setGlobalSettings(CONFIGURED);
    mockStore.setUserSettings({ applicant_profile: { smoker: false } });

    const notified = await notifiedListings({ providerId: 'drafts-no-name' });

    expect(llmCalls()).toHaveLength(0);
    expect(notified).toHaveLength(1);
    expect(notified[0]).not.toHaveProperty('applicationDraft');
  });

  it('asks nothing while the endpoint is incomplete, and still notifies', async () => {
    mockStore.setGlobalSettings({ ...CONFIGURED, llmModel: '' });

    const notified = await notifiedListings({ providerId: 'drafts-unconfigured' });

    expect(llmCalls()).toHaveLength(0);
    expect(notified).toHaveLength(1);
  });

  it('notifies every listing when the endpoint fails, each without a draft', async () => {
    mockStore.setGlobalSettings(CONFIGURED);
    fetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'upstream down' });

    const notified = await notifiedListings({ providerId: 'drafts-failing', ids: ['a', 'b'] });

    expect(notified.map((listing) => listing.id)).toEqual(['a', 'b']);
    expect(notified.every((listing) => listing.applicationDraft == null)).toBe(true);
    expect(mockStore.storedApplicationDrafts).toHaveLength(0);
  });
});
