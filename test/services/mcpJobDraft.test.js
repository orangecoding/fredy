/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  DRAFT_TTL_MS,
  applyDraftUpdate,
  discardDraft,
  emptyDraft,
  getDraft,
  missingRequired,
  nextStep,
  resolveProviderForUrl,
  startDraft,
  toUpsertPayload,
  updateDraft,
  _resetDraftsForTests,
} from '../../lib/mcp/jobDraftStore.js';

const IMMOSCOUT = { id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' };
const IMMOWELT = { id: 'immowelt', name: 'Immowelt', baseUrl: 'https://www.immowelt.de/' };

const CTX = {
  providers: [IMMOSCOUT, IMMOWELT],
  channels: [{ id: 'c1', name: 'Family', adapterId: 'telegram' }],
  addresses: ['Work', 'School'],
  shareableUsers: [{ id: 'u2', name: 'bob' }],
};

const RENT_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten';
const WELT_URL = 'https://www.immowelt.de/suche/koeln/wohnungen/mieten';

/** Apply a patch to a fresh draft and return the result, for the many single-field cases. */
const apply = (patch, draft = emptyDraft(), ctx = CTX) => applyDraftUpdate(draft, patch, ctx);

/** Walk a draft through the whole interview. */
function completedDraft(overrides = {}) {
  let draft = emptyDraft();
  for (const patch of [
    { name: 'Köln' },
    { providerUrls: [RENT_URL] },
    { dealType: 'rent' },
    { channelIds: ['c1'] },
    { skipRefinements: true },
  ]) {
    const result = applyDraftUpdate(draft, patch, CTX);
    expect(result.problems).toEqual([]);
    draft = result.draft;
  }
  return { ...draft, ...overrides };
}

beforeEach(() => {
  _resetDraftsForTests();
});

describe('the interview asks for one thing at a time, in order', () => {
  it('walks name → providers → dealType → channels → refinements → ready', () => {
    let draft = emptyDraft();
    const keys = [];
    for (const patch of [
      { name: 'Köln' },
      { providerUrls: [RENT_URL] },
      { dealType: 'rent' },
      { channelIds: ['c1'] },
      { skipRefinements: true },
    ]) {
      keys.push(nextStep(draft, CTX).key);
      draft = applyDraftUpdate(draft, patch, CTX).draft;
    }
    keys.push(nextStep(draft, CTX).key);

    expect(keys).toEqual(['name', 'providers', 'dealType', 'channels', 'refinements', 'ready']);
  });

  it('asks for the first unanswered field even when the answers arrive out of order', () => {
    const draft = apply({ channelIds: ['c1'], dealType: 'buy' }).draft;
    expect(nextStep(draft, CTX).key).toBe('name');
  });

  it('names what is still missing rather than declaring itself ready', () => {
    const draft = apply({ name: 'Köln', skipRefinements: true }).draft;
    expect(missingRequired(draft)).toEqual(['providerUrls', 'dealType', 'channelIds']);
    expect(nextStep(draft, CTX).question).not.toContain('Ready to create');
  });

  it('tells a user with no channels where to make one, instead of asking them to pick', () => {
    const draft = apply({ name: 'Köln', providerUrls: [RENT_URL], dealType: 'rent' }).draft;
    const step = nextStep(draft, { ...CTX, channels: [] });

    expect(step.key).toBe('channels');
    expect(step.question).toContain('Settings → Notifications');
  });

  it('offers the deal type it can read off the URLs, and asks anyway', () => {
    const draft = apply({ name: 'Köln', providerUrls: [RENT_URL] }).draft;
    expect(nextStep(draft, CTX).question).toContain('**renting**');
  });

  it('just asks when the URLs do not say', () => {
    const draft = apply({ name: 'Köln', providerUrls: ['https://www.immowelt.de/suche/koeln'] }).draft;
    expect(nextStep(draft, CTX).question).toBe('Is this job for renting or for buying?');
  });
});

describe('name', () => {
  it('trims what it stores', () => {
    expect(apply({ name: '  Köln  ' }).draft.name).toBe('Köln');
  });

  it.each([['x'.repeat(41)], ['   '], ['']])('refuses %s', (name) => {
    const result = apply({ name });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('1-40 characters');
  });
});

describe('provider URLs', () => {
  it('works the portal out from the host', () => {
    expect(apply({ providerUrls: [WELT_URL] }).draft.providers).toEqual([
      { id: 'immowelt', name: 'Immowelt', url: WELT_URL, enabled: true },
    ]);
  });

  it('refuses the portal homepage, saying why', () => {
    const result = apply({ providerUrls: ['https://www.immobilienscout24.de/'] });

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('homepage, not a search');
  });

  it('refuses a portal Fredy does not crawl, and lists the ones it does', () => {
    const result = apply({ providerUrls: ['https://www.example.com/suche'] });

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('unknown portal host "example.com"');
    expect(result.problems[0]).toContain('immobilienscout24.de');
  });

  it('refuses something that is not a URL at all', () => {
    expect(apply({ providerUrls: ['   '] }).problems[0]).toContain('is not a URL');
  });

  it('collapses duplicates', () => {
    expect(apply({ providerUrls: [RENT_URL, RENT_URL] }).draft.providers).toHaveLength(1);
  });

  it('replaces the previous list rather than adding to it', () => {
    const first = apply({ providerUrls: [RENT_URL] }).draft;
    expect(apply({ providerUrls: [WELT_URL] }, first).draft.providers.map((p) => p.id)).toEqual(['immowelt']);
  });

  it('resolves nothing for a host no provider claims', () => {
    expect(resolveProviderForUrl('https://example.com/x', CTX.providers)).toBeNull();
    expect(resolveProviderForUrl('https://immobilienscout24.de/Suche', CTX.providers)).toBe(IMMOSCOUT);
  });
});

describe('notification channels', () => {
  it("refuses an id that is not one of the user's channels", () => {
    const result = apply({ channelIds: ['nope'] });

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('not one of your notification channels');
    expect(result.problems[0]).toContain('c1 (Family)');
  });

  it('rejects the whole list when one entry is bad, changing nothing', () => {
    const before = apply({ channelIds: ['c1'] }).draft;
    const result = applyDraftUpdate(before, { channelIds: ['c1', 'nope'] }, CTX);

    expect(result.ok).toBe(false);
    expect(result.draft).toBe(before);
    expect(result.draft.channelIds).toEqual(['c1']);
  });

  it('collapses duplicates', () => {
    expect(apply({ channelIds: ['c1', 'c1'] }).draft.channelIds).toEqual(['c1']);
  });
});

describe('optional refinements', () => {
  it('is answered by declining it', () => {
    expect(apply({ skipRefinements: true }).draft.refinementsAnswered).toBe(true);
  });

  it('is answered by giving any one of them', () => {
    expect(apply({ blacklist: ['Tausch'] }).draft.refinementsAnswered).toBe(true);
    expect(apply({ enabled: false }).draft.refinementsAnswered).toBe(true);
  });

  it('drops a spec bound that is explicitly null and keeps the rest', () => {
    const withBoth = apply({ specFilter: { maxPrice: 1200, minSize: 60 } }).draft;
    expect(applyDraftUpdate(withBoth, { specFilter: { minSize: null } }, CTX).draft.specFilter).toEqual({
      maxPrice: 1200,
    });
  });

  it('treats an empty spec filter as no filter', () => {
    expect(apply({ specFilter: {} }).draft.specFilter).toBeNull();
    expect(apply({ specFilter: null }).draft.specFilter).toBeNull();
  });

  it.each([['maxPrice'], ['minSize'], ['minRooms']])('refuses a %s of zero', (key) => {
    const result = apply({ specFilter: { [key]: 0 } });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('positive number');
  });

  it('cleans up the blacklist', () => {
    expect(apply({ blacklist: [' Tausch ', '', 'Tausch', 'WG'] }).draft.blacklist).toEqual(['Tausch', 'WG']);
    expect(apply({ blacklist: [] }).draft.blacklist).toEqual([]);
  });

  it('defaults the commute action to notify', () => {
    expect(apply({ commuteFilter: { limits: { Work: 30 } } }).draft.commuteFilter).toEqual({
      action: 'notify',
      limits: { Work: 30 },
    });
  });

  it('refuses a commute limit for an address the user has not saved', () => {
    const result = apply({ commuteFilter: { limits: { Gym: 30 } } });

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('"Gym"');
    expect(result.problems[0]).toContain('Work, School');
  });

  it('refuses a commute filter whose limits all mean nothing', () => {
    const result = apply({ commuteFilter: { limits: { Work: 0 } } });

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('no valid limits');
  });

  it('refuses sharing with somebody who is not shareable', () => {
    const result = apply({ shareWithUsers: ['u9'] });

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('not a user you can share with');
  });

  it('accepts a shareable user', () => {
    expect(apply({ shareWithUsers: ['u2', 'u2'] }).draft.shareWithUsers).toEqual(['u2']);
  });

  it('reports every problem in one go, and applies none of them', () => {
    const result = apply({ name: '', channelIds: ['nope'], shareWithUsers: ['u9'] });

    expect(result.ok).toBe(false);
    expect(result.problems).toHaveLength(3);
    expect(result.draft).toEqual(emptyDraft());
  });
});

describe('what gets saved', () => {
  it('carries the interview into upsertJob arguments', () => {
    const draft = completedDraft({
      blacklist: ['Tausch'],
      specFilter: { maxPrice: 1200 },
      commuteFilter: { action: 'exclude', limits: { Work: 30 } },
      shareWithUsers: ['u2'],
    });

    expect(toUpsertPayload(draft, 'u1', 'job-1')).toEqual({
      jobId: 'job-1',
      userId: 'u1',
      name: 'Köln',
      enabled: true,
      blacklist: ['Tausch'],
      provider: [{ id: 'immoscout', name: 'Immoscout', url: RENT_URL, enabled: true }],
      notificationAdapter: [{ configuredAdapterId: 'c1' }],
      shareWithUsers: ['u2'],
      spatialFilter: null,
      specFilter: { maxPrice: 1200 },
      commuteFilter: { action: 'exclude', limits: { Work: 30 } },
      dealType: 'rent',
    });
  });

  it('keeps a job the user asked to start switched off', () => {
    expect(toUpsertPayload(completedDraft({ enabled: false }), 'u1', 'job-1').enabled).toBe(false);
  });

  it('falls back to the deal type in the URLs when the draft somehow carries none', () => {
    expect(toUpsertPayload(completedDraft({ dealType: null }), 'u1', 'job-1').dealType).toBe('rent');
  });
});

describe('the store keeps one interview per user', () => {
  it('resumes rather than restarts', () => {
    startDraft('u1');
    updateDraft('u1', { name: 'Köln' }, CTX);

    expect(startDraft('u1').resumed).toBe(true);
    expect(getDraft('u1').name).toBe('Köln');
  });

  it('starts over when explicitly asked to', () => {
    startDraft('u1');
    updateDraft('u1', { name: 'Köln' }, CTX);

    expect(startDraft('u1', { replace: true }).resumed).toBe(false);
    expect(getDraft('u1').name).toBeNull();
  });

  it('keeps two users apart', () => {
    startDraft('u1');
    startDraft('u2');
    updateDraft('u1', { name: 'Köln' }, CTX);

    expect(getDraft('u2').name).toBeNull();
  });

  it('reports whether there was anything to discard', () => {
    startDraft('u1');
    expect(discardDraft('u1')).toBe(true);
    expect(discardDraft('u1')).toBe(false);
    expect(getDraft('u1')).toBeNull();
  });

  it('refuses an update when no interview is in progress', () => {
    expect(updateDraft('u1', { name: 'Köln' }, CTX).draft).toBeNull();
  });
});

describe('a draft nobody comes back to expires', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is still there just before the deadline and gone just after', () => {
    startDraft('u1');

    vi.advanceTimersByTime(DRAFT_TTL_MS - 60_000);
    expect(getDraft('u1')).not.toBeNull();

    vi.advanceTimersByTime(120_000);
    expect(getDraft('u1')).toBeNull();
  });

  it('an answer pushes the deadline back', () => {
    startDraft('u1');

    vi.advanceTimersByTime(DRAFT_TTL_MS - 60_000);
    updateDraft('u1', { name: 'Köln' }, CTX);
    vi.advanceTimersByTime(DRAFT_TTL_MS - 60_000);

    expect(getDraft('u1')?.name).toBe('Köln');
  });
});

describe('portal hosts are unambiguous', () => {
  it('no two providers claim the same host, or resolution would be a coin toss', async () => {
    const { getProviders } = await import('../../lib/utils.js');
    const metas = (await getProviders()).map((provider) => provider.metaInformation);
    const hosts = metas.map((meta) => new URL(meta.baseUrl).hostname.replace(/^www\./i, ''));

    expect(metas.length).toBeGreaterThan(10);
    expect(new Set(hosts).size).toBe(hosts.length);
  });
});
