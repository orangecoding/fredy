/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * A half-built job, held between MCP tool calls.
 *
 * Creating a job needs four things the caller cannot guess - a name, at least one search URL from a
 * portal Fredy supports, a deal type and a notification channel - plus a handful of optional
 * filters. A single `create_job` tool would put the whole interview inside the model: what to ask
 * next, what has already been answered, which of six error messages applies. Claude can do that.
 * The local models this server is mostly pointed at (Qwen-class, via LM Studio) cannot: they send
 * one guessed payload, or forget the answer they were given two turns ago.
 *
 * So the server keeps the state and computes the next question, and the model only relays it.
 *
 * In memory rather than in a table: a draft is conversation, not data. Losing it on restart costs
 * one re-interview, which is cheaper than a migration and a cleanup sweep. Keyed by user so a
 * client that reconnects mid-interview picks up where it left off.
 *
 * Nothing here touches the database. Everything the validation needs about the instance - which
 * portals exist, which channels this user may use, what their addresses are called - arrives as a
 * {@link DraftContext} built by `jobDraftContext.js`, which is what makes this module testable
 * without a database and what stops a channel's secrets ever reaching it.
 */

import { normalizeHost, validateProviderUrl } from '../services/jobs/providerUrl.js';
import { DEAL_TYPES, normalizeDealType, detectDealTypeForJob } from '../services/dealType.js';
import { normalizeCommuteFilter } from '../utils/commuteBudget.js';

/**
 * How long a draft outlives its last update. Long enough to go and create a notification channel in
 * the web UI and come back, short enough that a forgotten interview is not still waiting tomorrow.
 * @type {number}
 */
export const DRAFT_TTL_MS = 30 * 60 * 1000;

/** Job name length, matching the `maxLength` the web form enforces. */
const MAX_NAME_LENGTH = 40;

/**
 * @typedef {object} JobDraft
 * @property {string|null} name
 * @property {Array<{id: string, name: string, url: string, enabled: boolean}>} providers
 * @property {'rent'|'buy'|null} dealType
 * @property {string[]} channelIds
 * @property {string[]} blacklist
 * @property {{maxPrice?: number, minSize?: number, minRooms?: number}|null} specFilter
 * @property {import('../utils/commuteBudget.js').CommuteFilter|null} commuteFilter
 * @property {string[]} shareWithUsers
 * @property {boolean} enabled
 * @property {boolean} refinementsAnswered - Whether the optional-filters question has been put to
 *   the user. Without it the interview would either ask forever or never ask at all.
 */

/**
 * @typedef {object} DraftContext
 * @property {Array<{id: string, name: string, baseUrl: string}>} providers - Every portal Fredy can
 *   crawl, as `metaInformation`.
 * @property {Array<{id: string, name: string, adapterId: string}>} channels - The channels this
 *   user is allowed to send through. Never carries `fields`: channel secrets must not reach an LLM.
 * @property {string[]} addresses - The labels of the user's saved addresses.
 * @property {Array<{id: string, name: string}>} shareableUsers
 */

/**
 * @typedef {object} DraftStep
 * @property {'name'|'providers'|'dealType'|'channels'|'refinements'|'ready'} key
 * @property {string} question - Put to the user as-is, translated into their language.
 */

/** @returns {JobDraft} */
export function emptyDraft() {
  return {
    name: null,
    providers: [],
    dealType: null,
    channelIds: [],
    blacklist: [],
    specFilter: null,
    commuteFilter: null,
    shareWithUsers: [],
    enabled: true,
    refinementsAnswered: false,
  };
}

/** @type {Map<string, {draft: JobDraft, updatedAt: number}>} */
const drafts = new Map();

/**
 * Drop drafts nobody came back to. Swept on access rather than on a timer: a Map of abandoned
 * interviews is a handful of objects, and a timer would keep the stdio process alive.
 */
function sweep(now = Date.now()) {
  for (const [userId, entry] of drafts) {
    if (now - entry.updatedAt > DRAFT_TTL_MS) drafts.delete(userId);
  }
}

/**
 * The draft this user is in the middle of, or null.
 * @param {string} userId
 * @returns {JobDraft|null}
 */
export function getDraft(userId) {
  sweep();
  return drafts.get(userId)?.draft ?? null;
}

/**
 * Begin an interview. An interview already under way is returned rather than thrown away - a client
 * that re-calls this after a dropped connection means "where were we", not "start over".
 *
 * @param {string} userId
 * @param {{replace?: boolean}} [options]
 * @returns {{draft: JobDraft, resumed: boolean}}
 */
export function startDraft(userId, { replace = false } = {}) {
  const existing = getDraft(userId);
  if (existing && !replace) return { draft: existing, resumed: true };
  const draft = emptyDraft();
  drafts.set(userId, { draft, updatedAt: Date.now() });
  return { draft, resumed: false };
}

/**
 * @param {string} userId
 * @returns {boolean} Whether there was anything to discard.
 */
export function discardDraft(userId) {
  sweep();
  return drafts.delete(userId);
}

/** Test seam. The store is module state; a test that did not clear it would leak into the next. */
export function _resetDraftsForTests() {
  drafts.clear();
}

/**
 * Which portal a pasted URL belongs to, by host.
 *
 * The host is the only part of a search URL that identifies the portal, and every provider declares
 * one in its `baseUrl`. Asking the user to name the portal as well as paste the URL would be asking
 * them for something the URL already says.
 *
 * @param {string} url
 * @param {Array<{id: string, name: string, baseUrl: string}>} providers
 * @returns {{id: string, name: string, baseUrl: string}|null}
 */
export function resolveProviderForUrl(url, providers) {
  const host = normalizeHost(url);
  if (host == null) return null;
  return (providers ?? []).find((provider) => normalizeHost(provider.baseUrl) === host) ?? null;
}

const supportedHostList = (ctx) =>
  (ctx.providers ?? []).map((provider) => `${provider.name} (${normalizeHost(provider.baseUrl)})`).join(', ');

/**
 * A finite, strictly positive number, or null. Used for every numeric refinement: a maximum price of
 * zero, of -1 or of NaN is not a filter, it is a job that matches nothing.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Apply an update to a draft.
 *
 * All or nothing: a patch that gets one field wrong applies none of it, and reports every problem
 * at once. Half-applying would leave the user's next answer landing on a draft that is not the one
 * the question was computed from.
 *
 * Arrays replace rather than merge. `providerUrls`, `channelIds`, `blacklist` and `shareWithUsers`
 * are always the complete desired list - an LLM asked to "add one more" reliably resends the whole
 * list, and much less reliably works out a delta.
 *
 * @param {JobDraft} draft
 * @param {object} patch
 * @param {DraftContext} ctx
 * @returns {{ok: boolean, draft: JobDraft, problems: string[]}}
 */
export function applyDraftUpdate(draft, patch, ctx) {
  /** @type {string[]} */
  const problems = [];
  const next = {
    ...draft,
    providers: [...draft.providers],
    channelIds: [...draft.channelIds],
    blacklist: [...draft.blacklist],
    shareWithUsers: [...draft.shareWithUsers],
  };
  let touchedRefinement = patch.skipRefinements === true;

  if (patch.name !== undefined) {
    const name = String(patch.name ?? '').trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      problems.push(`name: must be 1-${MAX_NAME_LENGTH} characters (got ${name.length}).`);
    } else {
      next.name = name;
    }
  }

  if (patch.providerUrls !== undefined) {
    /** @type {Array<{id: string, name: string, url: string, enabled: boolean}>} */
    const resolved = [];
    for (const raw of patch.providerUrls ?? []) {
      const url = String(raw ?? '').trim();
      const provider = resolveProviderForUrl(url, ctx.providers);
      if (provider == null) {
        const host = normalizeHost(url);
        problems.push(
          host == null
            ? `providerUrls: "${url}" is not a URL.`
            : `providerUrls: unknown portal host "${host}". Supported: ${supportedHostList(ctx)}.`,
        );
        continue;
      }
      const { problem } = validateProviderUrl(url, provider);
      if (problem === 'bareHost') {
        problems.push(
          `providerUrls: "${url}" is ${provider.name}'s homepage, not a search. Run the search on the portal first, then copy the address bar.`,
        );
        continue;
      }
      if (problem != null) {
        problems.push(`providerUrls: "${url}" is not a usable ${provider.name} search URL (${problem}).`);
        continue;
      }
      if (resolved.some((entry) => entry.url === url)) continue;
      resolved.push({ id: provider.id, name: provider.name, url, enabled: true });
    }
    if (problems.length === 0) next.providers = resolved;
  }

  if (patch.dealType !== undefined) {
    const dealType = normalizeDealType(patch.dealType);
    if (dealType == null) problems.push(`dealType: must be "rent" or "buy".`);
    else next.dealType = dealType;
  }

  if (patch.channelIds !== undefined) {
    /** @type {string[]} */
    const ids = [];
    for (const raw of patch.channelIds ?? []) {
      const id = String(raw ?? '').trim();
      const channel = (ctx.channels ?? []).find((candidate) => candidate.id === id);
      if (channel == null) {
        problems.push(
          `channelIds: "${id}" is not one of your notification channels. Yours: ${
            (ctx.channels ?? []).map((c) => `${c.id} (${c.name})`).join(', ') || 'none'
          }.`,
        );
        continue;
      }
      if (!ids.includes(id)) ids.push(id);
    }
    if (problems.length === 0) next.channelIds = ids;
  }

  if (patch.blacklist !== undefined) {
    touchedRefinement = true;
    const words = [];
    for (const raw of patch.blacklist ?? []) {
      const word = String(raw ?? '').trim();
      if (word.length > 0 && !words.includes(word)) words.push(word);
    }
    next.blacklist = words;
  }

  if (patch.specFilter !== undefined) {
    touchedRefinement = true;
    if (patch.specFilter == null) {
      next.specFilter = null;
    } else {
      const filter = { ...(next.specFilter ?? {}) };
      for (const key of ['maxPrice', 'minSize', 'minRooms']) {
        if (!(key in patch.specFilter)) continue;
        // An explicit null removes that one bound; the whole object being null clears them all.
        if (patch.specFilter[key] == null) {
          delete filter[key];
          continue;
        }
        const value = positiveNumber(patch.specFilter[key]);
        if (value == null) problems.push(`specFilter.${key}: must be a positive number.`);
        else filter[key] = value;
      }
      next.specFilter = Object.keys(filter).length > 0 ? filter : null;
    }
  }

  if (patch.commuteFilter !== undefined) {
    touchedRefinement = true;
    if (patch.commuteFilter == null) {
      next.commuteFilter = null;
    } else {
      const unknown = Object.keys(patch.commuteFilter.limits ?? {}).filter(
        (label) => !(ctx.addresses ?? []).includes(label),
      );
      if (unknown.length > 0) {
        problems.push(
          `commuteFilter: unknown address label${unknown.length > 1 ? 's' : ''} ${unknown
            .map((label) => `"${label}"`)
            .join(', ')}. Saved: ${(ctx.addresses ?? []).join(', ') || 'none'}.`,
        );
      } else {
        const filter = normalizeCommuteFilter(patch.commuteFilter);
        if (filter == null) {
          problems.push('commuteFilter: no valid limits. Each address needs a travel time in whole minutes.');
        } else {
          next.commuteFilter = filter;
        }
      }
    }
  }

  if (patch.shareWithUsers !== undefined) {
    touchedRefinement = true;
    const ids = [];
    for (const raw of patch.shareWithUsers ?? []) {
      const id = String(raw ?? '').trim();
      if (!(ctx.shareableUsers ?? []).some((user) => user.id === id)) {
        problems.push(
          `shareWithUsers: "${id}" is not a user you can share with. Available: ${
            (ctx.shareableUsers ?? []).map((u) => `${u.id} (${u.name})`).join(', ') || 'none'
          }.`,
        );
        continue;
      }
      if (!ids.includes(id)) ids.push(id);
    }
    if (problems.length === 0) next.shareWithUsers = ids;
  }

  if (patch.enabled !== undefined) {
    touchedRefinement = true;
    next.enabled = patch.enabled === true;
  }

  if (problems.length > 0) return { ok: false, draft, problems };

  if (touchedRefinement) next.refinementsAnswered = true;
  return { ok: true, draft: next, problems: [] };
}

/**
 * Apply an update to the stored draft, sliding its expiry.
 *
 * @param {string} userId
 * @param {object} patch
 * @param {DraftContext} ctx
 * @returns {{ok: boolean, draft: JobDraft|null, problems: string[]}}
 */
export function updateDraft(userId, patch, ctx) {
  const current = getDraft(userId);
  if (current == null) return { ok: false, draft: null, problems: [] };

  const result = applyDraftUpdate(current, patch, ctx);
  // The expiry slides even on a rejected update: the user is plainly still here, and timing out
  // mid-correction is the one moment it would cost the most.
  drafts.set(userId, { draft: result.draft, updatedAt: Date.now() });
  return result;
}

/**
 * What the job still cannot be saved without. Mirrors the web form's own requirements.
 * @param {JobDraft} draft
 * @returns {string[]}
 */
export function missingRequired(draft) {
  const missing = [];
  if (draft.name == null) missing.push('name');
  if (draft.providers.length === 0) missing.push('providerUrls');
  if (draft.dealType == null) missing.push('dealType');
  if (draft.channelIds.length === 0) missing.push('channelIds');
  return missing;
}

/**
 * A one-line summary of the draft, for the confirmation the user is asked for before it is created.
 * @param {JobDraft} draft
 * @param {DraftContext} ctx
 * @returns {string}
 */
export function describeDraft(draft, ctx) {
  const channelName = (id) => (ctx.channels ?? []).find((channel) => channel.id === id)?.name ?? id;
  const userName = (id) => (ctx.shareableUsers ?? []).find((user) => user.id === id)?.name ?? id;
  const spec = draft.specFilter;
  const lines = [
    `- **Name:** ${draft.name ?? '–'}`,
    `- **Deal type:** ${draft.dealType === DEAL_TYPES.BUY ? 'buying' : 'renting'}`,
    `- **Portals:** ${draft.providers.map((p) => `${p.name} (${p.url})`).join(', ') || '–'}`,
    `- **Notify via:** ${draft.channelIds.map(channelName).join(', ') || '–'}`,
    `- **Blacklist:** ${draft.blacklist.join(', ') || '–'}`,
    `- **Filters:** ${
      spec == null
        ? '–'
        : [
            spec.maxPrice != null ? `max ${spec.maxPrice} EUR` : null,
            spec.minSize != null ? `min ${spec.minSize} m²` : null,
            spec.minRooms != null ? `min ${spec.minRooms} rooms` : null,
          ]
            .filter(Boolean)
            .join(', ')
    }`,
    `- **Commute:** ${
      draft.commuteFilter == null
        ? '–'
        : `${Object.entries(draft.commuteFilter.limits)
            .map(([label, minutes]) => `${label} ≤ ${minutes} min`)
            .join(', ')} (${draft.commuteFilter.action})`
    }`,
    `- **Shared with:** ${draft.shareWithUsers.map(userName).join(', ') || '–'}`,
    `- **Enabled:** ${draft.enabled ? 'yes' : 'no'}`,
  ];
  return lines.join('\n');
}

/**
 * The one question to put to the user now.
 *
 * One at a time, in a fixed order, because that is the part a small model gets wrong when left to
 * itself: asked to gather six things it asks for all six in one breath, and then has to parse a
 * paragraph of half-answers.
 *
 * @param {JobDraft} draft
 * @param {DraftContext} ctx
 * @returns {DraftStep}
 */
export function nextStep(draft, ctx) {
  if (draft.name == null) {
    return { key: 'name', question: `What should this search be called? (up to ${MAX_NAME_LENGTH} characters)` };
  }

  if (draft.providers.length === 0) {
    return {
      key: 'providers',
      question:
        'Paste the search-result URL from the portal you want to watch - more than one is fine. ' +
        `Supported portals: ${supportedHostList(ctx)}. ` +
        'Run the search on the portal first and copy the address bar; the homepage on its own carries no search and would find nothing.',
    };
  }

  if (draft.dealType == null) {
    const hint = detectDealTypeForJob(draft.providers);
    return {
      key: 'dealType',
      question:
        hint == null
          ? 'Is this job for renting or for buying?'
          : `Those URLs look like a **${hint === DEAL_TYPES.BUY ? 'buying' : 'renting'}** search. Is this job for renting or for buying?`,
    };
  }

  if (draft.channelIds.length === 0) {
    const channels = ctx.channels ?? [];
    return {
      key: 'channels',
      question:
        channels.length === 0
          ? 'You have no notification channel yet, and a job cannot run without one. Create one in the web UI under Settings → Notifications, then say "done". This draft is kept for 30 minutes.'
          : `Which notification channel should new listings go to? Yours: ${channels
              .map((channel) => `${channel.id} (${channel.name}, ${channel.adapterId})`)
              .join(', ')}. Answer with one or more IDs.`,
    };
  }

  if (!draft.refinementsAnswered) {
    const addresses = ctx.addresses ?? [];
    const users = ctx.shareableUsers ?? [];
    return {
      key: 'refinements',
      question:
        'Optional refinements - answer with any of these, or say "skip": maximum price in EUR, minimum size in m², ' +
        'minimum number of rooms, words that should exclude a listing, ' +
        (addresses.length > 0
          ? `travel-time limits in minutes for your saved addresses (${addresses.join(', ')}), `
          : 'travel-time limits (you have no saved addresses yet - they are added in the web UI under Settings), ') +
        (users.length > 0
          ? `sharing with another user (${users.map((u) => `${u.id} (${u.name})`).join(', ')}), `
          : '') +
        'and whether the job should start switched on (default: yes).',
    };
  }

  const missing = missingRequired(draft);
  if (missing.length > 0) {
    return { key: 'ready', question: `Still missing: ${missing.join(', ')}.` };
  }

  return {
    key: 'ready',
    question:
      'Ready to create. Read this summary back to the user, and once they agree call create_job_from_draft with confirmed=true. ' +
      'An area filter (a shape drawn on the map) cannot be set here - it is added afterwards in the web UI under Jobs → edit → Refine.',
  };
}

/**
 * Turn a finished draft into the arguments `upsertJob` takes.
 *
 * @param {JobDraft} draft
 * @param {string} userId
 * @param {string} jobId
 * @returns {object}
 */
export function toUpsertPayload(draft, userId, jobId) {
  return {
    jobId,
    userId,
    name: draft.name,
    enabled: draft.enabled,
    blacklist: draft.blacklist,
    provider: draft.providers.map(({ id, name, url, enabled }) => ({ id, name, url, enabled })),
    notificationAdapter: draft.channelIds.map((configuredAdapterId) => ({ configuredAdapterId })),
    shareWithUsers: draft.shareWithUsers,
    // Not askable over MCP: a polygon is drawn, not described. The created-job response says where
    // to add one.
    spatialFilter: null,
    specFilter: draft.specFilter,
    commuteFilter: normalizeCommuteFilter(draft.commuteFilter),
    // Same fallback chain the HTTP route uses, so a job created here is classified identically to
    // one created by the form.
    dealType: normalizeDealType(draft.dealType) ?? detectDealTypeForJob(draft.providers) ?? DEAL_TYPES.RENT,
  };
}
