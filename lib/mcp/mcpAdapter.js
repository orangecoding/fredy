/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { FINANCE_CURRENCY } from '../services/providers/currency.js';
import { MixedCurrencyError } from '../errors.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { queryJobs, getJob } from '../services/storage/jobStorage.js';
import { queryListings, getListingById } from '../services/storage/listingsStorage.js';
import {
  deleteListingsFor,
  MAX_LISTING_NOTES_LENGTH,
  setListingNotesFor,
  setListingStatusFor,
  unwatchListingFor,
  watchListingFor,
} from '../services/listings/listingActionService.js';
import { authenticateToolCall, authenticateWriteToolCall, checkJobAccess } from './mcpAuthentication.js';
import {
  deleteJob,
  findModifiableJob,
  saveJob,
  setJobEnabled,
  startAllJobRuns,
  startJobRun,
} from '../services/jobs/jobService.js';
import { getNotificationAdapters } from '../utils.js';
import { describeChannel } from '../notification/adapterSummary.js';
import { deleteChannel, listUsableChannels, saveChannel, testChannel } from '../services/channels/channelService.js';
import { getUserSettings } from '../services/storage/settingsStorage.js';
import { updateUserSettings } from '../services/settings/userSettingsService.js';
import { computeFinanceResult } from '../services/finance/calculate.js';
import { normalizeProfile } from '../services/finance/profile.js';
import { computeBudget, netIncomeOf, scoreRentListing } from '../services/finance/affordability.js';
import { DEAL_TYPES, normalizeDealType } from '../services/dealType.js';
import { buildApplicationLetter } from '../services/application/applicationService.js';
import { fetchListingPicture } from '../services/listings/listingPictures.js';
import { getListingPicture } from '../services/storage/listingMediaStorage.js';
import { filterMask, TECHNOLOGIES, OPERATOR_CODES } from '../services/connectivity/mobileBits.js';
import {
  normalizeListJobs,
  normalizeGetJob,
  normalizeListListings,
  normalizeGetListing,
  normalizeCalculateFinancing,
  normalizeRentAffordability,
  normalizeListingNotes,
  normalizeWatch,
  normalizeJobDraft,
  normalizeJobCreated,
  normalizeDraftDiscarded,
  normalizeApplicationLetter,
  normalizeError,
  normalizeRunStarted,
  normalizeJobStatus,
  normalizeJobUpdated,
  normalizeJobDeleted,
  normalizeListChannels,
  normalizeListAdapters,
  normalizeChannelSaved,
  normalizeChannelDeleted,
  normalizeChannelTested,
  normalizeListingStatus,
  normalizeListingDeleted,
  normalizeAddListing,
  normalizeUserSettings,
  normalizeSettingsChanged,
} from './mcpNormalizer.js';
import {
  applyDraftUpdate,
  describeDraft,
  discardDraft,
  emptyDraft,
  getDraft,
  missingRequired,
  nextStep,
  startDraft,
  toUpsertPayload,
  updateDraft,
} from './jobDraftStore.js';
import { buildDraftContext } from './jobDraftContext.js';
import { trackPoi } from '../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../TRACKING_POIS.js';

/**
 * What a model should do about a refused channel save, by the rule that refused it. The refusal
 * itself comes from the channel service, worded the same as the web form shows it.
 * @type {Record<string, string>}
 */
const CHANNEL_SAVE_HINTS = Object.freeze({
  unknownAdapter: ' Call list_adapters for the ones this Fredy knows.',
  missingFields: ' Ask the user for the missing value - list_adapters says what each field is.',
});

/**
 * @typedef {Object} McpToolInfo
 * @property {string} name The name a client calls the tool by.
 * @property {string} title The short, human title from the tool's annotations.
 * @property {string} description The description the assistant reads.
 * @property {boolean} readOnly Whether the tool only reads, from its `readOnlyHint`.
 */

/**
 * An `McpServer` that keeps hold of the tools registered on it.
 *
 * The SDK hands each registration back but keeps no public list of them, and both the settings page
 * (which tools exist) and the per-user switches (turn these off) need one. Recording them here means
 * the tool definitions below stay the only place a tool is described.
 */
class FredyMcpServer extends McpServer {
  /** @type {Map<string, import('@modelcontextprotocol/sdk/server/mcp.js').RegisteredTool>} */
  fredyTools = new Map();

  /**
   * @param {string} name
   * @param {...any} rest
   * @returns {import('@modelcontextprotocol/sdk/server/mcp.js').RegisteredTool}
   */
  tool(name, ...rest) {
    const registered = super.tool(name, ...rest);
    this.fredyTools.set(name, registered);
    return registered;
  }
}

/** @type {McpToolInfo[]|null} */
let toolCatalog = null;

/**
 * Every tool this server offers, as the settings page lists them.
 *
 * Read off a server built for the purpose rather than kept as a second list, so a tool added to
 * {@link createMcpServer} shows up on the page without anyone touching the UI. Built once: the set of
 * tools is fixed for the life of the process.
 *
 * @returns {McpToolInfo[]}
 */
export function mcpToolCatalog() {
  toolCatalog ??= [...createMcpServer().fredyTools].map(([name, tool]) => ({
    name,
    title: tool.annotations?.title ?? name,
    description: tool.description ?? '',
    readOnly: tool.annotations?.readOnlyHint === true,
  }));
  return toolCatalog;
}

/**
 * Bring the tools a server lists in line with one user's settings.
 *
 * Only a tool whose state actually changes is touched: every enable or disable makes the SDK send
 * `notifications/tools/list_changed`, and this runs on every request. With the server switched off
 * nothing is listed, though the HTTP route refuses such a user before it gets here.
 *
 * @param {McpServer} server A server from {@link createMcpServer}.
 * @param {import('./mcpUserSettings.js').McpServerSettings} settings
 * @returns {void}
 */
export function applyMcpToolSettings(server, { enabled, disabledTools }) {
  const off = new Set(disabledTools);
  for (const [name, tool] of server.fredyTools) {
    const listed = enabled && !off.has(name);
    if (tool.enabled === listed) continue;
    if (listed) tool.enable();
    else tool.disable();
  }
}

/**
 * Create a configured MCP server instance with all Fredy tools registered.
 *
 * The adapter fetches raw data from storage and delegates response formatting
 * to the normalizer layer (mcpNormalizer.js) which produces a consistent
 * { ok, summary, data, meta } envelope for every tool response.
 *
 * Each tool call requires a userId (resolved from the MCP token before invocation).
 * Tools respect user scoping: non-admin users only see their own jobs/listings.
 *
 * Every tool is listed until {@link applyMcpToolSettings} trims the list to what a user left on.
 *
 * @returns {FredyMcpServer}
 */
export function createMcpServer() {
  const server = new FredyMcpServer(
    {
      name: 'fredy-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        'Fredy MCP Server - query real estate jobs and listings. ' +
        'All timestamps are unix timestamps in milliseconds (e.g. 1772008362564). ' +
        'Use list_jobs to browse jobs, get_job for details, ' +
        'list_listings to search listings (supports time filters like createdAfter/createdBefore and ' +
        'connectivity filters like minDownMbit/fiberOnly/mobileTech), ' +
        'get_listing for full details of a single listing (including internet and mobile coverage), ' +
        'and calculate_financing to work out whether a listing is affordable (German mortgage model). ' +
        'Responses are formatted as markdown with a summary, data (tables for lists, key-value for details), and pagination info. ' +
        'Always present results to the user as soon as you have them - do NOT call the tool again unless you need additional pages or different data. ' +
        'Fredy can also write. add_listing_note appends a note to a listing and set_listing_notes replaces its notes outright; ' +
        'watch_listing and unwatch_listing manage the watchlist and are safe to repeat. ' +
        'A search job is created through an interview, not in one call: start_job_draft first, then ask the user exactly ONE question at a time - ' +
        "the one returned under 'Next question', in the user's own language - and pass each answer to update_job_draft. " +
        'Never invent a value the user has not given, never ask for several fields at once, and do not ask about optional fields the draft has not asked about. ' +
        'List fields are always the complete list, replacing the previous one. ' +
        "When the draft reports 'Ready to create', read the summary back to the user and only then call create_job_from_draft with confirmed=true. " +
        'Area filters (shapes drawn on a map) cannot be set here - tell the user to add one in the web UI afterwards. ' +
        'get_application_letter drafts a ready-to-send application letter (Anschreiben) for one listing, written in the ' +
        "language of the portal it came from and filled from the user's stored applicant profile - resolve a listing the " +
        'user named by title through list_listings first, then pass its id. Hand the letter back exactly as returned. ' +
        'Fredy can also be administered through MCP. run_job runs one search now, run_all_jobs every search - ' +
        'the running Fredy server carries them out, and the standalone stdio server says so when it is not running. ' +
        'set_job_enabled switches a job on or off. update_job edits an existing job: read it with get_job first, ' +
        'pass only what should change, every list is the complete list replacing the previous one, and the drawn area ' +
        'filter cannot be changed here. delete_job removes a job with all its listings once the user has confirmed. ' +
        'Notification channels are managed with list_channels, list_adapters, create_channel, update_channel, ' +
        'delete_channel and test_channel; stored field values (tokens, chat ids) are never shown back, and a channel ' +
        'still used by a job cannot be deleted. set_listing_status marks a listing applied, rejected or accepted, ' +
        'add_listing_by_url stores a single advert the user pastes, delete_listing removes one - softly by default. ' +
        "get_user_settings and update_user_settings read and change the user's own settings - language, theme, home " +
        'addresses, finance profile and applicant profile. Pass only the field the user asked to change, and confirm ' +
        'with them before anything delete_job, delete_channel or delete_listing does.',
    },
  );

  // ── list_jobs ───────────────────────────────────────────────────────
  server.tool(
    'list_jobs',
    'List real estate search jobs for the authenticated user. ' +
      'Returns up to 50 jobs per page by default. Use pagination (page parameter) to fetch more. ' +
      'Check meta.hasMore to know if there are additional pages.',
    {
      page: z.number().optional().describe('Page number (default: 1)'),
      pageSize: z
        .number()
        .optional()
        .describe('Results per page (default: 50, max: 1000). Start with the default and paginate if needed.'),
      filter: z.string().optional().describe('Free-text filter on job name'),
    },
    { title: 'List search jobs', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ page, pageSize, filter }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'list_jobs');
      if (error) return normalizeError(error, 'list_jobs');

      const safePage = page ?? 1;
      const safePageSize = pageSize ?? 50;

      const result = queryJobs({
        page: safePage,
        pageSize: safePageSize,
        freeTextFilter: filter,
        userId: user.id,
        isAdmin: user.isAdmin,
      });

      return normalizeListJobs(result, { page: safePage, pageSize: safePageSize });
    },
  );

  // ── get_job ─────────────────────────────────────────────────────────
  server.tool(
    'get_job',
    'Get detailed information about a specific job by its ID.',
    {
      jobId: z.string().describe('The job ID to retrieve'),
    },
    { title: 'Get job details', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ jobId }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_job');
      if (error) return normalizeError(error, 'get_job');

      const job = getJob(jobId);
      if (!job) {
        return normalizeError('Job not found.', 'get_job');
      }

      if (!checkJobAccess(user, job)) {
        return normalizeError('Access denied.', 'get_job');
      }

      return normalizeGetJob(job);
    },
  );

  // ── list_listings ───────────────────────────────────────────────────
  server.tool(
    'list_listings',
    'Search and list real estate listings. Returns up to 50 listings per page by default. ' +
      'Use pagination (page parameter) to fetch more. Check meta.hasMore in the response. ' +
      'Supports text search, time filtering, and various filters. ' +
      'All timestamps are unix timestamps in milliseconds (e.g. 1772008362564). ' +
      'Use createdAfter/createdBefore to filter by time, e.g. "give me all listings from today". ' +
      'Use get_listing to get full details (description, link, image) for a specific listing.',
    {
      page: z.number().optional().describe('Page number (default: 1)'),
      pageSize: z
        .number()
        .optional()
        .describe('Results per page (default: 50, max: 1000). Start with the default and paginate if needed.'),
      filter: z.string().optional().describe('Free-text search across title, address, provider, link'),
      jobId: z.string().optional().describe('Filter listings by job ID'),
      activeOnly: z.boolean().optional().describe('When true, only show active listings'),
      provider: z.string().optional().describe('Filter by provider name'),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional()
        .describe(
          'Only include listings priced in this ISO 4217 code (e.g. EUR or CHF). Set this for minPrice or maxPrice when the listings span several currencies.',
        ),
      createdAfter: z
        .number()
        .optional()
        .describe(
          'Only include listings created at or after this unix timestamp in milliseconds (e.g. 1772008362564). Useful for queries like "listings from today".',
        ),
      createdBefore: z
        .number()
        .optional()
        .describe(
          'Only include listings created at or before this unix timestamp in milliseconds (e.g. 1772008362564).',
        ),
      minPrice: z
        .number()
        .optional()
        .describe(
          'Only include listings with price >= this value (e.g. 500). Price is a numeric value (no currency symbol).',
        ),
      maxPrice: z
        .number()
        .optional()
        .describe(
          'Only include listings with price <= this value (e.g. 1500). Price is a numeric value (no currency symbol).',
        ),
      sortField: z
        .string()
        .optional()
        .describe(
          'Sort by: published_at (the date the portal states, falling back to when Fredy found the listing), created_at, price, size, provider, title, is_active',
        ),
      sortDir: z.string().optional().describe('Sort direction: asc or desc'),
      status: z
        .enum(['applied', 'rejected', 'accepted', 'none'])
        .optional()
        .describe(
          'Filter by user-set status. "applied", "rejected", or "accepted" return only listings with that status; "none" returns only listings without a status set.',
        ),
      minDownMbit: z
        .number()
        .optional()
        .describe('Only include listings whose fixed-line downstream is at least this many Mbit/s (e.g. 100).'),
      fiberOnly: z.boolean().optional().describe('When true, only listings with fibre to the building or home.'),
      mobileTech: z
        .enum(TECHNOLOGIES)
        .optional()
        .describe('Require mobile coverage of this technology at the address (2g, 4g, 5g, or 5g_sa).'),
      mobileOperator: z
        .enum(OPERATOR_CODES)
        .optional()
        .describe(
          'Narrow mobileTech to a single German operator: dt (Telekom), vf (Vodafone), tf (O2 / Telefónica), ee (1&1). Ignored without mobileTech.',
        ),
    },
    { title: 'Search listings', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async (
      {
        page,
        pageSize,
        filter,
        jobId,
        activeOnly,
        provider,
        currency,
        createdAfter,
        createdBefore,
        minPrice,
        maxPrice,
        sortField,
        sortDir,
        status,
        minDownMbit,
        fiberOnly,
        mobileTech,
        mobileOperator,
      },
      extra,
    ) => {
      const { user, error } = authenticateToolCall(extra, 'list_listings');
      if (error) return normalizeError(error, 'list_listings');

      const safePage = page ?? 1;
      const safePageSize = pageSize ?? 50;
      const mobileMask = mobileTech ? filterMask(mobileTech, mobileOperator ?? null) : null;

      let result;
      try {
        result = queryListings({
          page: safePage,
          pageSize: safePageSize,
          freeTextFilter: filter,
          jobIdFilter: jobId,
          activityFilter: activeOnly === true ? true : activeOnly === false ? false : undefined,
          providerFilter: provider,
          currencyFilter: currency ?? null,
          createdAfter: createdAfter ?? null,
          createdBefore: createdBefore ?? null,
          minPrice: minPrice ?? null,
          maxPrice: maxPrice ?? null,
          sortField: sortField ?? null,
          sortDir: sortDir ?? 'desc',
          statusFilter: status,
          connectivityMinDown: minDownMbit ?? null,
          connectivityFiberOnly: fiberOnly === true,
          connectivityMobileMask: mobileMask,
          userId: user.id,
          isAdmin: user.isAdmin,
        });
      } catch (error) {
        if (!(error instanceof MixedCurrencyError)) throw error;
        // A job can hold one provider's sites in two currencies, so jobId and provider alone may
        // never get there. The error names everything the model can change.
        return normalizeError(
          'minPrice and maxPrice need listings in one currency, and these span several. ' +
            'Set currency, narrow the search with jobId or provider, or leave the price range out.',
          'list_listings',
        );
      }

      return normalizeListListings(result, { page: safePage, pageSize: safePageSize });
    },
  );

  // ── get_listing ─────────────────────────────────────────────────────
  server.tool(
    'get_listing',
    'Get full details of a single listing by its ID.',
    {
      listingId: z.string().describe('The listing ID to retrieve'),
    },
    { title: 'Get listing details', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ listingId }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_listing');
      if (error) return normalizeError(error, 'get_listing');

      const listing = getListingById(listingId, user.id, user.isAdmin);
      if (!listing) {
        return normalizeError('Listing not found or access denied.', 'get_listing');
      }

      return normalizeGetListing(listing);
    },
  );

  // ── get_application_letter ─────────────────────────────────────────────────────
  server.tool(
    'get_application_letter',
    'Draft a ready-to-send application letter (Anschreiben / Bewerbung) for a single listing. The letter is ' +
      "written in the language of the portal the listing came from and is filled with the user's stored applicant " +
      'profile. Resolve a listing the user named by title through list_listings first, then pass its id here.',
    {
      listingId: z.string().describe('The listing ID to write the letter for'),
      language: z
        .string()
        .optional()
        .describe('Override the letter language (ISO 639-1, e.g. de, en, it). Omit to follow the portal.'),
    },
    { title: 'Draft application letter', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async ({ listingId, language }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_application_letter');
      if (error) return normalizeError(error, 'get_application_letter');

      // Geometry is a polyline decode per address that a letter has no use for.
      const listing = getListingById(listingId, user.id, user.isAdmin, { includeGeometry: false });
      if (!listing) {
        return normalizeError('Listing not found or access denied.', 'get_application_letter');
      }

      try {
        const letter = await buildApplicationLetter(listing, user.id, { language: language ?? null });
        await trackPoi(TRACKING_POIS.MCP_APPLICATION_LETTER);
        return normalizeApplicationLetter(listing, letter, 'get_application_letter');
      } catch (error) {
        // Without this the SDK's own catch answers with a bare message and no envelope, so the
        // model cannot tell a failure apart from a letter.
        return normalizeError(error.message ?? 'Could not draft the letter.', 'get_application_letter');
      }
    },
  );

  // ── get_photo_for_listing ─────────────────────────────────────────────────────
  server.tool(
    'get_photo_for_listing',
    'Fetch and return the photo of a listing by its ID as an image for vision analysis.',
    {
      listingId: z.string().describe('The listing ID whose photo to fetch'),
    },
    { title: 'Get listing photo', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    async ({ listingId }, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_photo_for_listing');
      if (error) return normalizeError(error, 'get_photo_for_listing');

      const listing = getListingById(listingId, user.id, user.isAdmin);
      if (!listing) {
        return normalizeError('Listing not found or access denied.', 'get_photo_for_listing');
      }

      // The picture Fredy kept is the one to hand over: it needs no request, and it is still there
      // after the portal has taken the advert down.
      const stored = getListingPicture(listingId);
      if (stored?.content != null) {
        return { content: [{ type: 'image', data: stored.content.toString('base64'), mimeType: stored.mimeType }] };
      }

      const imageUrl = listing.image_url;
      if (!imageUrl) {
        return normalizeError('No image available for this listing.', 'get_photo_for_listing');
      }

      // The URL is scraped, so fetching it is doing what a portal's markup said. Fredy usually runs
      // inside a home network, where "whatever that markup says" must not mean the router, the NAS
      // or a cloud metadata endpoint. `fetchListingPicture` checks every hop against
      // `isPubliclyFetchableUrl` and only accepts the bytes of a picture type vision models read.
      try {
        const { buffer, mimeType } = await fetchListingPicture(imageUrl);
        return { content: [{ type: 'image', data: buffer.toString('base64'), mimeType }] };
      } catch (error) {
        return normalizeError(`Failed to fetch image: ${error.message}`, 'get_photo_for_listing');
      }
    },
  );

  // ── calculate_financing ─────────────────────────────────────────────────────
  server.tool(
    'calculate_financing',
    'Work out whether a property is affordable, using a German Annuitätendarlehen model. ' +
      "Pass a listingId to use that listing's price, or purchasePrice to check an arbitrary one. " +
      "Any field left out falls back to the user's saved finance profile, so calling this with just " +
      'a listingId is usually enough. Returns the monthly rate, the years to payoff, the Restschuld ' +
      'at the end of the fixed-rate period, the debt-free age, and a verdict against the 35 % rule. ' +
      'When the listing belongs to a rental job, the answer is a rent verdict instead - warm rent ' +
      'against the same budget, with no loan involved. Results are estimates, not financial advice.',
    {
      listingId: z.string().optional().describe('Listing to price up. Its price overrides purchasePrice.'),
      purchasePrice: z.number().optional().describe('Purchase price in EUR, when not using a listing'),
      equity: z.number().optional().describe('Eigenkapital in EUR'),
      bundesland: z
        .string()
        .optional()
        .describe('Two-letter Bundesland code (BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH)'),
      annualRate: z.number().optional().describe('Nominal interest rate (Sollzins) in percent, e.g. 3.8'),
      tilgung: z.number().optional().describe('Initial amortization in percent per year, e.g. 2'),
      fixedYears: z.number().optional().describe('Zinsbindung in years, e.g. 10'),
      monthlyPayment: z
        .number()
        .optional()
        .describe('Monthly instalment in EUR. Overrides tilgung, since the two fix each other.'),
      maklerPct: z.number().optional().describe('Buyer agent commission in percent; 0 for a private sale'),
      netIncome: z.number().optional().describe('Combined monthly net income, overriding the saved profile'),
      livingCosts: z.number().optional().describe('Monthly living costs excluding rent'),
    },
    { title: 'Calculate financing', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async (args, extra) => {
      const { user, error } = authenticateToolCall(extra, 'calculate_financing');
      if (error) return normalizeError(error, 'calculate_financing');

      // Start from whatever the user configured in the UI, so an LLM only has to supply
      // what it wants to change.
      const profile = normalizeProfile(getUserSettings(user.id)?.finance_profile);

      // The household overrides are applied before anything branches on them. Both answers, the
      // mortgage and the rent verdict, are measured against this budget, so an income passed in
      // here has to reach the rental path too.
      if (args.netIncome != null) {
        profile.personA = { ...profile.personA, enabled: true, primaryIncome: args.netIncome, secondaryIncome: 0 };
        profile.personB = { ...profile.personB, enabled: false };
      }
      if (args.livingCosts != null) profile.livingCosts = args.livingCosts;

      // Without an income there is no budget, and every verdict would come back "out of reach"
      // off the back of a zero the caller never supplied. Saying so beats answering confidently.
      if (netIncomeOf(profile) <= 0) {
        return normalizeError(
          'No net income available. Save a finance profile in Fredy, or pass netIncome with this call.',
          'calculate_financing',
        );
      }

      let listing = null;
      let purchasePrice = args.purchasePrice;
      if (args.listingId) {
        listing = getListingById(args.listingId, user.id, user.isAdmin);
        if (!listing) {
          return normalizeError('Listing not found.', 'calculate_financing');
        }
        if (listing.currency !== FINANCE_CURRENCY) {
          return normalizeError('Financing supports EUR listings only.', 'calculate_financing');
        }
        if (listing.price == null) {
          return normalizeError('That listing has no price, so it cannot be financed.', 'calculate_financing');
        }
        // A rental has no loan to model - its price is a monthly rent. Running the mortgage math
        // on it would answer a question nobody asked, with a number that looks authoritative.
        if (listing.dealType === DEAL_TYPES.RENT) {
          return normalizeRentAffordability(scoreRentListing(listing, profile), computeBudget(profile), listing);
        }
        purchasePrice = listing.price;
      }
      if (purchasePrice == null) {
        return normalizeError('Provide either a listingId or a purchasePrice.', 'calculate_financing');
      }

      const scenario = { ...(profile.financing.scenarios[0] || {}) };
      if (args.annualRate != null) scenario.annualRate = args.annualRate;
      if (args.tilgung != null) scenario.tilgung = args.tilgung;
      if (args.fixedYears != null) scenario.fixedYears = args.fixedYears;
      // An explicit instalment wins over the Tilgung, matching the UI.
      if (args.monthlyPayment != null) scenario.monthlyPayment = args.monthlyPayment;
      else if (args.tilgung != null) scenario.monthlyPayment = null;

      profile.financing = {
        ...profile.financing,
        purchasePrice,
        equity: args.equity ?? profile.financing.equity,
        bundesland: args.bundesland ?? profile.financing.bundesland,
        maklerPct: args.maklerPct ?? profile.financing.maklerPct,
        scenarios: [scenario],
      };

      try {
        return normalizeCalculateFinancing(computeFinanceResult(profile), listing);
      } catch (err) {
        return normalizeError(err.message, 'calculate_financing');
      }
    },
  );

  // ── get_current_date_ime ─────────────────────────────────────────────────────
  server.tool(
    'get_current_date_time',
    'Returns the current date and time.',
    {},
    { title: 'Current date & time', readOnlyHint: true, idempotentHint: false, openWorldHint: false },
    () => {
      return {
        content: [{ type: 'text', text: `Timestring: ${new Date().toLocaleString()}, MS since 1970: ${Date.now()}` }],
      };
    },
  );

  /*
   * ── Write tools ───────────────────────────────────────────────────────────
   *
   * Everything below changes something, through the listing actions the web routes call
   * (`listingActionService.js`), which check access before every write. Each tool also reads the
   * listing first, through the same scoping the read tools use, because its answer names the listing
   * it changed.
   */

  /**
   * Resolve a listing the caller may see, for the answer that names it.
   *
   * @param {string} listingId
   * @param {{id: string, isAdmin?: boolean}} user
   * @returns {object|null}
   */
  const writableListing = (listingId, user) =>
    getListingById(listingId, user.id, user.isAdmin, { includeGeometry: false });

  // ── add_listing_note ────────────────────────────────────────────────
  server.tool(
    'add_listing_note',
    'Append a note to a listing, keeping whatever notes it already has. ' +
      'Use this for anything the user wants to remember about a property - a viewing date, what the ' +
      'agent said, why they liked or disliked it. ' +
      'To rewrite or delete existing notes instead, use set_listing_notes.',
    {
      listingId: z.string().describe('The listing to annotate'),
      note: z.string().min(1).max(5000).describe('The note to append. Added on its own line below any existing notes.'),
    },
    {
      title: 'Add note to listing',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ listingId, note }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'add_listing_note');
      if (error) return normalizeError(error, 'add_listing_note');

      const listing = writableListing(listingId, user);
      if (!listing) return normalizeError('Listing not found or access denied.', 'add_listing_note');

      const addition = note.trim();
      if (addition.length === 0) return normalizeError('The note is empty.', 'add_listing_note');

      const existing = typeof listing.notes === 'string' ? listing.notes.trim() : '';
      const next = existing.length > 0 ? `${existing}\n${addition}` : addition;

      // Refused rather than truncated: the caller wrote these words on the user's behalf, and
      // quietly keeping some of them is worse than saying the note did not fit.
      if (next.length > MAX_LISTING_NOTES_LENGTH) {
        return normalizeError(
          `The listing already holds ${existing.length} characters of notes, and this would take it past the ${MAX_LISTING_NOTES_LENGTH} character limit. Nothing was changed. Shorten the note, or use set_listing_notes to rewrite them.`,
          'add_listing_note',
        );
      }

      const saved = setListingNotesFor(user, listingId, next);
      if (!saved.ok) return normalizeError(saved.error, 'add_listing_note');
      await trackPoi(TRACKING_POIS.MCP_LISTING_NOTE_WRITTEN);
      return normalizeListingNotes(listing, next, 'add_listing_note');
    },
  );

  // ── set_listing_notes ───────────────────────────────────────────────
  server.tool(
    'set_listing_notes',
    'Replace the notes on a listing with new text, discarding whatever was there before. ' +
      'Pass an empty string to clear the notes entirely. ' +
      'Prefer add_listing_note unless the user explicitly wants the existing notes rewritten or removed - ' +
      'read the current notes back to them first if you are unsure.',
    {
      listingId: z.string().describe('The listing whose notes are being replaced'),
      notes: z.string().max(MAX_LISTING_NOTES_LENGTH).describe('The text to store. An empty string clears the notes.'),
    },
    {
      title: 'Replace notes on listing',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ listingId, notes }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'set_listing_notes');
      if (error) return normalizeError(error, 'set_listing_notes');

      const listing = writableListing(listingId, user);
      if (!listing) return normalizeError('Listing not found or access denied.', 'set_listing_notes');

      const saved = setListingNotesFor(user, listingId, notes);
      if (!saved.ok) return normalizeError(saved.error, 'set_listing_notes');
      await trackPoi(TRACKING_POIS.MCP_LISTING_NOTE_WRITTEN);
      return normalizeListingNotes(listing, notes, 'set_listing_notes');
    },
  );

  // ── watch_listing ───────────────────────────────────────────────────
  server.tool(
    'watch_listing',
    "Put a listing on the user's watchlist. Watched listings survive the retention sweep and are " +
      'filterable in the web UI. Calling this on a listing that is already watched changes nothing ' +
      'and is not an error.',
    { listingId: z.string().describe('The listing to watch') },
    {
      title: 'Watch listing',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ listingId }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'watch_listing');
      if (error) return normalizeError(error, 'watch_listing');

      const listing = writableListing(listingId, user);
      if (!listing) return normalizeError('Listing not found or access denied.', 'watch_listing');

      // `ensureWatch` answers "is it watched now", which is true either way. Whether this call is
      // what put it there has to come from the row read a moment ago.
      const wasWatched = Boolean(listing.isWatched);
      const watched = watchListingFor(user, listingId);
      if (!watched.ok) return normalizeError(watched.error, 'watch_listing');

      if (!wasWatched) await trackPoi(TRACKING_POIS.MCP_LISTING_WATCH_CHANGED);
      return normalizeWatch(listing, { watched: true, changed: !wasWatched }, 'watch_listing');
    },
  );

  // ── unwatch_listing ─────────────────────────────────────────────────
  server.tool(
    'unwatch_listing',
    "Take a listing off the user's watchlist. Calling this on a listing that is not watched " +
      'changes nothing and is not an error.',
    { listingId: z.string().describe('The listing to stop watching') },
    {
      title: 'Unwatch listing',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ listingId }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'unwatch_listing');
      if (error) return normalizeError(error, 'unwatch_listing');

      const listing = writableListing(listingId, user);
      if (!listing) return normalizeError('Listing not found or access denied.', 'unwatch_listing');

      const unwatched = unwatchListingFor(user, listingId);
      if (!unwatched.ok) return normalizeError(unwatched.error, 'unwatch_listing');
      if (unwatched.changed) await trackPoi(TRACKING_POIS.MCP_LISTING_WATCH_CHANGED);
      return normalizeWatch(listing, { watched: false, changed: unwatched.changed }, 'unwatch_listing');
    },
  );

  /*
   * ── The job interview ─────────────────────────────────────────────────────
   *
   * A job needs four things a caller cannot invent and a handful of optional filters, and the
   * server - not the model - keeps track of which of them are answered. See `jobDraftStore.js` for
   * why.
   */

  /**
   * Render whatever state the draft is in now. Every draft tool answers with this shape, so the
   * model never has to work out what changed.
   *
   * @param {import('./jobDraftStore.js').JobDraft} draft
   * @param {import('./jobDraftStore.js').DraftContext} context
   * @param {{problems?: string[], reference?: boolean, tool: string}} options
   */
  const draftAnswer = (draft, context, { problems = [], reference = false, tool }) =>
    normalizeJobDraft(
      {
        context,
        step: nextStep(draft, context),
        problems,
        reference,
        summary: describeDraft(draft, context),
      },
      tool,
    );

  // ── start_job_draft ─────────────────────────────────────────────────
  server.tool(
    'start_job_draft',
    'Begin creating a new search job. Call this first, before asking the user anything. ' +
      'It answers with the portals this Fredy supports, the notification channels this user has, and ' +
      'the single first question to put to them. Work through the interview one question at a time, ' +
      'passing each answer to update_job_draft. ' +
      'An interview already in progress is returned as it stands rather than restarted.',
    {
      replace: z
        .boolean()
        .optional()
        .describe('Throw away an interview already in progress and start over. Only when the user asks to.'),
    },
    {
      title: 'Start creating a search job',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ replace }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'start_job_draft');
      if (error) return normalizeError(error, 'start_job_draft');

      const context = await buildDraftContext(user);
      const { draft } = startDraft(user.id, { replace: replace === true });
      return draftAnswer(draft, context, { reference: true, tool: 'start_job_draft' });
    },
  );

  // ── update_job_draft ────────────────────────────────────────────────
  server.tool(
    'update_job_draft',
    "Record the user's answer to the question the draft last asked, and get the next one. " +
      'Only pass fields the user actually gave you - never guess a value, and never fill in a field ' +
      'that has not been asked about yet. Every list field is the complete list, replacing what was ' +
      'there before. If the update is refused, nothing is changed: relay the problems and ask again.',
    {
      name: z.string().optional().describe('Job name, 1-40 characters'),
      providerUrls: z
        .array(z.string())
        .optional()
        .describe(
          'Search-result URLs, one per portal. The full list, replacing the previous one. The portal ' +
            'is worked out from the URL - do not ask the user to name it.',
        ),
      dealType: z.enum(['rent', 'buy']).optional().describe('Whether this search is for renting or for buying'),
      channelIds: z
        .array(z.string())
        .optional()
        .describe('IDs of the notification channels to send through. The full list, replacing the previous one.'),
      blacklist: z
        .array(z.string())
        .optional()
        .describe('Words that exclude a listing when they appear in it. The full list; an empty list clears it.'),
      excludedLocations: z
        .array(z.string())
        .optional()
        .describe(
          'Locations that exclude a listing when its address contains them, ignoring case. Applies only to this job. The full list; an empty list clears it.',
        ),
      specFilter: z
        .object({
          maxPrice: z
            .number()
            .positive()
            .nullable()
            .optional()
            .describe('Maximum price in the selected providers’ currency; providers must share one currency'),
          minSize: z.number().positive().nullable().optional().describe('Minimum size in m²'),
          minRooms: z.number().positive().nullable().optional().describe('Minimum number of rooms'),
        })
        .nullable()
        .optional()
        .describe('Price/size/rooms bounds. Null clears all of them; a null member clears just that one.'),
      commuteFilter: z
        .object({
          action: z
            .enum(['mark', 'notify', 'exclude'])
            .optional()
            .describe('What to do with a listing that is too far. Defaults to notify.'),
          limits: z
            .record(z.string(), z.number())
            .describe("Travel time in minutes, keyed by the exact label of one of the user's saved addresses"),
        })
        .nullable()
        .optional()
        .describe('Travel-time limits. Null clears them.'),
      marketFilter: z
        .object({
          action: z
            .enum(['mark', 'notify', 'exclude'])
            .optional()
            .describe('What to do with a listing that misses a target. Defaults to notify.'),
          minBelowMarketPercent: z
            .number()
            .positive()
            .max(100)
            .nullable()
            .optional()
            .describe('How far under the local median price per m² a listing has to be, in percent'),
          minYieldPercent: z
            .number()
            .positive()
            .max(100)
            .nullable()
            .optional()
            .describe('Gross rental yield a listing for sale has to reach, in percent a year. Buying jobs only.'),
        })
        .nullable()
        .optional()
        .describe('What the job expects of the market around a listing. Null clears it.'),
      priceChangeThreshold: z
        .number()
        .min(0)
        .max(50)
        .nullable()
        .optional()
        .describe(
          'Smallest price change, in percent, this job sends a price change notification for. Null uses the instance setting.',
        ),
      shareWithUsers: z
        .array(z.string())
        .optional()
        .describe('IDs of other users who should see this job. The full list, replacing the previous one.'),
      enabled: z.boolean().optional().describe('Whether the job starts switched on. Defaults to true.'),
      skipRefinements: z
        .boolean()
        .optional()
        .describe('Set when the user declines the optional filters, so the interview moves on.'),
    },
    {
      title: 'Update the search job draft',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (patch, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'update_job_draft');
      if (error) return normalizeError(error, 'update_job_draft');

      const context = await buildDraftContext(user);
      const { ok, draft, problems } = updateDraft(user.id, patch, context);
      if (draft == null) {
        return normalizeError('No job draft in progress. Call start_job_draft first.', 'update_job_draft');
      }
      return draftAnswer(draft, context, { problems: ok ? [] : problems, tool: 'update_job_draft' });
    },
  );

  // ── create_job_from_draft ───────────────────────────────────────────
  server.tool(
    'create_job_from_draft',
    'Create the job the interview has been building. ' +
      'Only call this once the draft has reported that it is ready, you have read the summary back to ' +
      'the user, and they have agreed to it.',
    {
      confirmed: z.boolean().describe('Set to true only after the user has confirmed the summary.'),
    },
    {
      title: 'Create the search job',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ confirmed }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'create_job_from_draft');
      if (error) return normalizeError(error, 'create_job_from_draft');

      if (confirmed !== true) {
        return normalizeError(
          'Not confirmed. Read the summary back to the user and call again with confirmed=true once they agree.',
          'create_job_from_draft',
        );
      }

      const draft = getDraft(user.id);
      if (draft == null) {
        return normalizeError('No job draft in progress. Call start_job_draft first.', 'create_job_from_draft');
      }

      // Re-validated from scratch against a freshly read context rather than trusted: minutes may
      // have passed since each answer, and a channel can be made private, a saved address renamed
      // or a shared user deleted in that time. The interview is not an authorization.
      const context = await buildDraftContext(user);
      const revalidated = applyDraftUpdate(emptyDraft(), toDraftPatch(draft), context);
      if (!revalidated.ok) {
        return normalizeError(
          `The draft is no longer valid:\n\n${revalidated.problems.map((problem) => `- ${problem}`).join('\n')}`,
          'create_job_from_draft',
        );
      }

      // From here on it is the revalidated draft that gets saved, not the one the interview
      // accumulated. They hold the same answers, but only this one resolved them against the
      // context as it is now - a provider renamed since the URL was pasted would otherwise be
      // stored under the name it had two answers ago.
      const checked = revalidated.draft;

      const missing = missingRequired(checked);
      if (missing.length > 0) {
        const step = nextStep(checked, context);
        return normalizeError(
          `The job is not complete yet. Still missing: ${missing.join(', ')}.\n\nAsk the user:\n\n> ${step.question}`,
          'create_job_from_draft',
        );
      }

      // Stored through the web form's own save, which checks everything again.
      const saved = await saveJob(user, toUpsertPayload(checked, nanoid()));
      if (!saved.ok) return normalizeError(saved.error, 'create_job_from_draft');
      const jobId = saved.jobId;
      discardDraft(user.id);
      await trackPoi(TRACKING_POIS.MCP_JOB_CREATED);

      const job = getJob(jobId);
      if (job == null) return normalizeError('The job could not be read back after creation.', 'create_job_from_draft');
      return normalizeJobCreated(job);
    },
  );

  // ── discard_job_draft ───────────────────────────────────────────────
  server.tool(
    'discard_job_draft',
    'Throw away the job interview in progress. Nothing is created. Use it when the user changes their mind.',
    {},
    {
      title: 'Discard the search job draft',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (_args, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'discard_job_draft');
      if (error) return normalizeError(error, 'discard_job_draft');

      return normalizeDraftDiscarded(discardDraft(user.id));
    },
  );

  /*
   * ── Administration tools ─────────────────────────────────────────────────
   *
   * Everything below runs Fredy rather than reads it: triggering searches, editing and deleting
   * jobs, configuring the channels they notify through, marking and removing listings, and the
   * user's own settings. Each goes through `authenticateWriteToolCall` - the scope gate and the
   * demo gate - and then calls the same service the corresponding web route calls
   * (`lib/services/jobs/jobService.js`, `channels/channelService.js`,
   * `listings/listingActionService.js`, `settings/`), so every rule a change is held to is written
   * once. What stays here is what only a model needs: confirmation before a destructive call,
   * merging instead of replacing where a model cannot read back what it would replace, and answers
   * that say what to do next.
   */

  /**
   * The adapter configs installed in this Fredy, read per call rather than once at module scope:
   * the adapter modules are loaded from disk, and neither the stdio server nor a run that touches
   * no channel has any use for them.
   *
   * @returns {Promise<Array<object>>}
   */
  const installedAdapterConfigs = async () =>
    (await getNotificationAdapters()).map((module) => module.config).filter(Boolean);

  /**
   * Put a refusal from the job service the way a model can act on it.
   *
   * @param {import('../services/serviceResult.js').ServiceFailure} failure
   * @param {string} tool - For the error envelope.
   * @returns {{content: Array, isError: boolean}}
   */
  const jobRefusal = (failure, tool) =>
    normalizeError(
      failure.code === 'notYours' ? `${failure.error} list_jobs shows the ones that are.` : failure.error,
      tool,
    );

  /**
   * Store a channel for `create_channel` and `update_channel`, through the same save the web form
   * uses, and put a refusal the way a model can act on it.
   *
   * The one thing asked for differently is `mergeFields`: a model is never shown a secret, so it
   * sends only the fields that change and the service merges them into what is stored.
   *
   * @param {{id: string, isAdmin?: boolean}} user
   * @param {{channelId?: string, adapterId?: string, name?: string, fields?: object, visibility?: string}} args
   * @param {string} tool - For the error envelope.
   * @returns {Promise<{content: Array, isError?: boolean}>}
   */
  const saveChannelFromTool = async (user, args, tool) => {
    const saved = await saveChannel(
      user,
      {
        id: args.channelId ?? null,
        adapterId: args.adapterId,
        name: args.name,
        fields: args.fields,
        visibility: args.visibility,
      },
      { mergeFields: true },
    );
    if (!saved.ok) return normalizeError(`${saved.error}${CHANNEL_SAVE_HINTS[saved.code] ?? ''}`, tool);

    await trackPoi(TRACKING_POIS.MCP_CHANNEL_SAVED);
    return normalizeChannelSaved(
      saved.channel,
      {
        created: saved.created,
        destination: describeChannel(saved.adapterConfig, saved.channel.fields),
        adapterName: saved.adapterConfig.name,
      },
      tool,
    );
  };

  // ── list_channels ───────────────────────────────────────────────────
  server.tool(
    'list_channels',
    'List the notification channels this user may attach to a job, with the job count of each. ' +
      'Field values are never included - use list_adapters to see what a new channel asks for.',
    {},
    { title: 'List notification channels', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async (_args, extra) => {
      const { user, error } = authenticateToolCall(extra, 'list_channels');
      if (error) return normalizeError(error, 'list_channels');

      const channels = await listUsableChannels(user);
      return normalizeListChannels(channels);
    },
  );

  // ── list_adapters ───────────────────────────────────────────────────
  server.tool(
    'list_adapters',
    'The notification types this Fredy can send through, with the field definitions a channel of ' +
      'that type takes (which one names the destination, which are secrets, which Fredy creates itself). ' +
      'Read this before create_channel.',
    {},
    { title: 'List notification types', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async (_args, extra) => {
      // Nothing user-scoped in the answer - the catalog is the same for everyone - but the call
      // still goes through the gate, so a user who switched this tool off is refused here.
      const { error } = authenticateToolCall(extra, 'list_adapters');
      if (error) return normalizeError(error, 'list_adapters');

      return normalizeListAdapters(await installedAdapterConfigs());
    },
  );

  // ── get_user_settings ───────────────────────────────────────────────
  server.tool(
    'get_user_settings',
    "Read the user's own Fredy settings: language, theme, the addresses listings are measured against, " +
      'the finance profile behind calculate_financing, and the applicant profile behind application letters. ' +
      'Change them with update_user_settings.',
    {},
    { title: 'Read user settings', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    async (_args, extra) => {
      const { user, error } = authenticateToolCall(extra, 'get_user_settings');
      if (error) return normalizeError(error, 'get_user_settings');

      return normalizeUserSettings(getUserSettings(user.id));
    },
  );

  // ── run_job ─────────────────────────────────────────────────────────
  server.tool(
    'run_job',
    'Run one search job now, instead of waiting for its next scheduled run. It runs in the background: ' +
      "new listings reach the job's notification channels a few minutes later. Nothing about the run comes back in " +
      'this answer - list_listings and the channels are where its outcome shows up.',
    { jobId: z.string().describe('The job to run, from list_jobs') },
    {
      title: 'Run a search now',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ jobId }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'run_job');
      if (error) return normalizeError(error, 'run_job');

      // The same start as the web UI's run button: owner or admin, not the tour job, not one already
      // running, and only from a process a Fredy server runs in.
      const started = startJobRun(user, jobId);
      if (!started.ok) return jobRefusal(started, 'run_job');

      await trackPoi(TRACKING_POIS.MCP_JOB_RUN);
      return normalizeRunStarted([started.job], 'run_job');
    },
  );

  // ── run_all_jobs ────────────────────────────────────────────────────
  server.tool(
    'run_all_jobs',
    'Run every search job now: for an admin, every job on the instance; for everyone else, their own. ' +
      'The runs happen in the background, each going to its own notification channels.',
    {},
    {
      title: 'Run every search now',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (_args, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'run_all_jobs');
      if (error) return normalizeError(error, 'run_all_jobs');

      // The listener scopes this to the user's own jobs unless they are an admin - the same split
      // POST /api/jobs/startAll applies, through the same call.
      const started = startAllJobRuns(user);
      if (!started.ok) return jobRefusal(started, 'run_all_jobs');
      await trackPoi(TRACKING_POIS.MCP_JOB_RUN);
      return normalizeRunStarted(null, 'run_all_jobs');
    },
  );

  // ── set_job_enabled ─────────────────────────────────────────────────
  server.tool(
    'set_job_enabled',
    'Switch a job on or off. A disabled job is skipped by the scheduler and by run_all_jobs, but keeps ' +
      'everything it has found. Repeating the call on a job that is already in the asked-for state is not an error.',
    {
      jobId: z.string().describe('The job to switch, from list_jobs'),
      enabled: z.boolean().describe('true to switch the job on, false to switch it off'),
    },
    {
      title: 'Enable or disable a job',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ jobId, enabled }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'set_job_enabled');
      if (error) return normalizeError(error, 'set_job_enabled');

      const switched = await setJobEnabled(user, jobId, enabled);
      if (!switched.ok) return jobRefusal(switched, 'set_job_enabled');
      if (switched.changed) await trackPoi(TRACKING_POIS.MCP_JOB_STATUS_CHANGED);
      return normalizeJobStatus(
        switched.job,
        { enabled: switched.enabled, changed: switched.changed },
        'set_job_enabled',
      );
    },
  );

  // ── update_job ──────────────────────────────────────────────────────
  server.tool(
    'update_job',
    'Edit an existing job. Read it with get_job first, then pass only what should change. ' +
      'Every list (providerUrls, channelIds, blacklist, excludedLocations, shareWithUsers) is the ' +
      'complete list, replacing what was there before - to add a search, resend every URL get_job lists ' +
      'plus the new one. An empty list clears it, and an update that ' +
      'would leave the job without a name, a search URL, a deal type or a channel is refused. ' +
      'An area filter drawn on the map cannot be set here; the existing one is kept.',
    {
      jobId: z.string().describe('The job to change, from list_jobs'),
      name: z.string().optional().describe('Job name, 1-40 characters'),
      providerUrls: z
        .array(z.string())
        .optional()
        .describe('Search-result URLs, one per portal. The full list, replacing the previous one.'),
      dealType: z.enum(['rent', 'buy']).optional().describe('Whether this job searches for renting or for buying'),
      channelIds: z
        .array(z.string())
        .optional()
        .describe('IDs of the notification channels to send through. The full list, replacing the previous one.'),
      blacklist: z
        .array(z.string())
        .optional()
        .describe('Words that exclude a listing when they appear in it. The full list; an empty list clears it.'),
      excludedLocations: z
        .array(z.string())
        .optional()
        .describe(
          'Locations that exclude a listing when its address contains them, ignoring case. The full list; an empty list clears it.',
        ),
      specFilter: z
        .object({
          maxPrice: z
            .number()
            .positive()
            .nullable()
            .optional()
            .describe('Maximum price in the job providers’ currency; providers must share one currency'),
          minSize: z.number().positive().nullable().optional().describe('Minimum size in m²'),
          minRooms: z.number().positive().nullable().optional().describe('Minimum number of rooms'),
        })
        .nullable()
        .optional()
        .describe('Price/size/rooms bounds. Null clears all of them; a null member clears just that one.'),
      commuteFilter: z
        .object({
          action: z
            .enum(['mark', 'notify', 'exclude'])
            .optional()
            .describe('What to do with a listing that is too far. Defaults to notify.'),
          limits: z
            .record(z.string(), z.number())
            .describe("Travel time in minutes, keyed by the exact label of one of the user's saved addresses"),
        })
        .nullable()
        .optional()
        .describe('Travel-time limits. Null clears them.'),
      marketFilter: z
        .object({
          action: z
            .enum(['mark', 'notify', 'exclude'])
            .optional()
            .describe('What to do with a listing that misses a target. Defaults to notify.'),
          minBelowMarketPercent: z
            .number()
            .positive()
            .max(100)
            .nullable()
            .optional()
            .describe('How far under the local median price per m² a listing has to be, in percent'),
          minYieldPercent: z
            .number()
            .positive()
            .max(100)
            .nullable()
            .optional()
            .describe('Gross rental yield a listing for sale has to reach, in percent a year. Buying jobs only.'),
        })
        .nullable()
        .optional()
        .describe('What the job expects of the market around a listing. Null clears it.'),
      priceChangeThreshold: z
        .number()
        .min(0)
        .max(50)
        .nullable()
        .optional()
        .describe(
          'Smallest price change, in percent, this job sends a price change notification for. Null uses the instance setting.',
        ),
      shareWithUsers: z
        .array(z.string())
        .optional()
        .describe('IDs of other users who should see this job. The full list, replacing the previous one.'),
      enabled: z.boolean().optional().describe('Whether the job is switched on.'),
    },
    {
      title: 'Edit a search job',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (patch, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'update_job');
      if (error) return normalizeError(error, 'update_job');

      const { jobId } = patch;
      const found = findModifiableJob(user, jobId);
      if (!found.ok) return jobRefusal(found, 'update_job');
      const { job } = found;

      // The stored job is the draft this edit starts from, and the interview's own validation
      // decides what may change: URLs resolved against the real providers, channels against the
      // ones this user may use, addresses against their saved labels - all or nothing.
      const context = await buildDraftContext(user);
      const { ok, draft, problems } = applyDraftUpdate(draftFromJob(job), { ...patch, jobId: undefined }, context);
      if (!ok) {
        return normalizeError(
          `The update was refused, and nothing was changed:\n\n${problems.map((problem) => `- ${problem}`).join('\n')}`,
          'update_job',
        );
      }

      // The interview would go on asking for what is missing; an edit has no next question, only
      // a stored job that could never find anything.
      const missing = missingRequired(draft);
      if (missing.length > 0) {
        return normalizeError(
          `This update would leave the job without ${missing.join(', ')}. Nothing was changed - ` +
            'resend the complete list for anything you meant to replace.',
          'update_job',
        );
      }

      // Stored through the web form's own save, which checks everything again: the interview words
      // a problem for a model, the save decides.
      const saved = await saveJob(user, {
        ...toUpsertPayload(draft, jobId),
        // A polygon is drawn on the map, not described in words. Whatever edit came over MCP, the
        // shape the user drew stays as it is.
        spatialFilter: job.spatialFilter ?? null,
      });
      if (!saved.ok) return jobRefusal(saved, 'update_job');
      await trackPoi(TRACKING_POIS.MCP_JOB_UPDATED);
      return normalizeJobUpdated(draft, { summary: describeDraft(draft, context) }, 'update_job');
    },
  );

  // ── delete_job ──────────────────────────────────────────────────────
  server.tool(
    'delete_job',
    'Remove a job and every listing it has found. This cannot be undone. Confirm with the user ' +
      'before calling it with confirmed=true; call it without to be told what is at stake.',
    {
      jobId: z.string().describe('The job to remove, from list_jobs'),
      confirmed: z
        .boolean()
        .describe('Set to true only after the user has confirmed - the job and all its listings are removed.'),
    },
    {
      title: 'Delete a search job',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ jobId, confirmed }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'delete_job');
      if (error) return normalizeError(error, 'delete_job');

      // Unconfirmed, every check still runs and nothing is deleted, so a job that may not be deleted
      // is refused before the user is asked about it.
      const deleted = await deleteJob(user, jobId, { dryRun: confirmed !== true });
      if (!deleted.ok) return jobRefusal(deleted, 'delete_job');
      if (confirmed !== true) {
        return normalizeError(
          'Not confirmed. Deleting removes the job and every listing it has found, permanently. ' +
            'Confirm with the user, then call again with confirmed=true.',
          'delete_job',
        );
      }

      await trackPoi(TRACKING_POIS.MCP_JOB_DELETED);
      return normalizeJobDeleted(deleted.job, 'delete_job');
    },
  );

  // ── create_channel ──────────────────────────────────────────────────
  server.tool(
    'create_channel',
    'Create a notification channel a job can send through. The adapter ID and the field names come ' +
      'from list_adapters, and every field not marked optional needs a value; field values are stored but ' +
      'never shown back. Visibility (who else may attach the channel to a job) is an admin decision - a ' +
      'channel created here is private unless an admin says otherwise.',
    {
      adapterId: z.string().describe('The notification type, from list_adapters (e.g. telegram, email).'),
      name: z.string().min(1).describe('A name for the channel, as the job form shows it.'),
      fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe(
          'The adapter’s field values, keyed as list_adapters shows. Secrets are stored but never shown back; ' +
            'fields marked as generated (a feed url) are created by Fredy and must not be sent.',
        ),
      visibility: z
        .enum(['private', 'admin', 'everyone'])
        .optional()
        .describe('Who may attach this channel to a job. Admins only; everyone else’s channels are private.'),
    },
    {
      title: 'Create a notification channel',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (args, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'create_channel');
      if (error) return normalizeError(error, 'create_channel');

      return saveChannelFromTool(user, args, 'create_channel');
    },
  );

  // ── update_channel ──────────────────────────────────────────────────
  server.tool(
    'update_channel',
    'Rename or reconfigure a notification channel. Send only the fields that change: each one sent ' +
      'replaces that stored value, null removes an optional one, and every field left out keeps its ' +
      'stored value - so changing a chat id never needs the token again. The adapter type is fixed at ' +
      'creation. Visibility is an admin decision.',
    {
      channelId: z.string().describe('The channel to change, from list_channels.'),
      name: z.string().min(1).optional().describe('A new name. Omit to keep the current one.'),
      fields: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional()
        .describe(
          'Only the fields to change, keyed as list_adapters shows. Every field left out keeps its stored ' +
            'value; null removes an optional one. Secrets are stored but never shown back.',
        ),
      visibility: z
        .enum(['private', 'admin', 'everyone'])
        .optional()
        .describe('Who may attach this channel to a job. Admins only; ignored for everyone else.'),
    },
    {
      title: 'Edit a notification channel',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (args, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'update_channel');
      if (error) return normalizeError(error, 'update_channel');

      return saveChannelFromTool(user, args, 'update_channel');
    },
  );

  // ── delete_channel ──────────────────────────────────────────────────
  server.tool(
    'delete_channel',
    'Remove a notification channel. A channel still used by jobs is refused, and the answer names ' +
      'the jobs - detach it from them with update_job first. Confirm with the user before calling ' +
      'with confirmed=true.',
    {
      channelId: z.string().describe('The channel to remove, from list_channels.'),
      confirmed: z.boolean().describe('Set to true only after the user has confirmed the deletion.'),
    },
    {
      title: 'Delete a notification channel',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ channelId, confirmed }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'delete_channel');
      if (error) return normalizeError(error, 'delete_channel');

      // Unconfirmed, every check still runs and nothing is deleted: a channel a job still sends
      // through cannot be deleted whatever the user answers, so it is refused before they are asked.
      const deleted = deleteChannel(user, channelId, { dryRun: confirmed !== true });
      if (!deleted.ok) {
        const hint =
          deleted.code === 'inUse'
            ? ' Remove it from those jobs first - update_job takes the full channelIds list without it.'
            : '';
        return normalizeError(`${deleted.error}${hint}`, 'delete_channel');
      }
      if (confirmed !== true) {
        return normalizeError(
          'Not confirmed. Confirm with the user, then call again with confirmed=true.',
          'delete_channel',
        );
      }

      await trackPoi(TRACKING_POIS.MCP_CHANNEL_DELETED);
      return normalizeChannelDeleted(deleted.channel, 'delete_channel');
    },
  );

  // ── test_channel ────────────────────────────────────────────────────
  server.tool(
    'test_channel',
    'Send one test listing through a stored channel, exactly as the web UI’s "Try" button does, so the ' +
      'user can check the chat, mailbox or feed it points at. Uses the stored values - a secret that was ' +
      'never stored correctly fails here, which is the point.',
    { channelId: z.string().describe('The channel to test, from list_channels.') },
    {
      title: 'Test a notification channel',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ channelId }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'test_channel');
      if (error) return normalizeError(error, 'test_channel');

      // The same send as the web UI's "Try" button, with the stored values.
      const tested = await testChannel(user, channelId);
      if (!tested.ok) return normalizeError(tested.error, 'test_channel');
      await trackPoi(TRACKING_POIS.MCP_CHANNEL_TESTED);
      return normalizeChannelTested(tested.channel, 'test_channel');
    },
  );

  // ── set_listing_status ──────────────────────────────────────────────
  server.tool(
    'set_listing_status',
    'Mark a listing as applied, rejected or accepted, or clear its status with "none". The status is ' +
      'what list_listings filters on, and what the web UI shows as the row’s decision. Setting a status ' +
      'also puts the listing on the watchlist, as the web UI does; clearing it leaves the watchlist alone.',
    {
      listingId: z.string().describe('The listing to mark'),
      status: z
        .enum(['applied', 'rejected', 'accepted', 'none'])
        .describe('The status to record, or "none" to clear it.'),
    },
    {
      title: 'Set a listing status',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ listingId, status }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'set_listing_status');
      if (error) return normalizeError(error, 'set_listing_status');

      const listing = writableListing(listingId, user);
      if (!listing) return normalizeError('Listing not found or access denied.', 'set_listing_status');

      // "none" is the tool’s way of saying "no status", because an absent field must never look
      // like a decision the caller forgot to make. The rest - a status also watches the listing -
      // is the web route's, through the same call.
      const marked = setListingStatusFor(user, listingId, status === 'none' ? null : status);
      if (!marked.ok) return normalizeError(marked.error, 'set_listing_status');
      await trackPoi(TRACKING_POIS.MCP_LISTING_STATUS_SET);
      return normalizeListingStatus(listing, marked.status, 'set_listing_status');
    },
  );

  // ── add_listing_by_url ──────────────────────────────────────────────
  server.tool(
    'add_listing_by_url',
    'Store a single advert the user pastes the address of, outside any job run. It lands under the job ' +
      'the user names - which is what gives it a deal type, distances, travel times and channels - and a ' +
      'later run of that job recognises it rather than storing it twice. Reading the page can take a ' +
      'moment, and only some portals support it; the answer says which failure, if any.',
    {
      url: z.string().describe('The advert page’s address, straight from the browser’s address bar.'),
      jobId: z.string().describe('The job to store it under, from list_jobs.'),
      watch: z
        .boolean()
        .optional()
        .describe(
          'Also put the listing on the user’s watchlist, the way "Add listing" in the web UI can. Default: no.',
        ),
    },
    {
      title: 'Add a listing by its URL',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ url, jobId, watch }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'add_listing_by_url');
      if (error) return normalizeError(error, 'add_listing_by_url');

      // Loaded on call rather than imported at the top: this service drags the whole pipeline and
      // with it the browser stack, which the stdio server has no use for until somebody adds an advert.
      const { addListingByUrl } = await import('../services/listings/manualListingService.js');
      const result = await addListingByUrl({ user, url, jobId, watch: watch === true });

      if (result.status === 'created') await trackPoi(TRACKING_POIS.MCP_LISTING_ADDED_BY_URL);
      return normalizeAddListing(result, 'add_listing_by_url');
    },
  );

  // ── delete_listing ──────────────────────────────────────────────────
  server.tool(
    'delete_listing',
    'Remove a listing. By default it is only hidden - the web UI can restore it, and calling again with ' +
      'hard=true removes it permanently. Confirm with the user before calling with confirmed=true.',
    {
      listingId: z.string().describe('The listing to remove'),
      hard: z
        .boolean()
        .optional()
        .describe('true to remove the row permanently. Default: hide it, which the web UI can undo.'),
      confirmed: z.boolean().describe('Set to true only after the user has confirmed the removal.'),
    },
    {
      title: 'Remove a listing',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ listingId, hard, confirmed }, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'delete_listing');
      if (error) return normalizeError(error, 'delete_listing');

      // Hidden listings included: removing one for good after hiding it is the second step this
      // tool's own answer offers, and every other lookup here skips them.
      const listing = getListingById(listingId, user.id, user.isAdmin, { includeGeometry: false, includeHidden: true });
      if (!listing) return normalizeError('Listing not found or access denied.', 'delete_listing');

      if (confirmed !== true) {
        return normalizeError(
          hard === true
            ? 'Not confirmed. A hard delete removes the listing permanently and cannot be undone. ' +
                'Confirm with the user, then call again with confirmed=true.'
            : 'Not confirmed. The listing would only be hidden, which the web UI can undo. ' +
                'Confirm with the user, then call again with confirmed=true.',
          'delete_listing',
        );
      }

      const alreadyHidden = listing.manually_deleted === 1;
      if (alreadyHidden && hard !== true) {
        return normalizeListingDeleted(listing, { hard: false, alreadyHidden: true }, 'delete_listing');
      }

      const deleted = await deleteListingsFor(user, [listingId], { hard: hard === true });
      if (!deleted.ok) return normalizeError(deleted.error, 'delete_listing');
      await trackPoi(TRACKING_POIS.MCP_LISTING_DELETED);
      return normalizeListingDeleted(listing, { hard: hard === true, alreadyHidden: false }, 'delete_listing');
    },
  );

  // ── update_user_settings ────────────────────────────────────────────
  server.tool(
    'update_user_settings',
    "Change the user's own Fredy settings: language, theme, home addresses, finance profile, " +
      'applicant profile. Pass only the setting the user asked to change. homeAddresses is always the ' +
      'complete list. The two profiles are merged instead: send only the keys that change, as ' +
      'get_user_settings shows them - nested objects merge key by key, lists and plain values replace, ' +
      'and null on a key removes it. Null for a whole profile clears it.',
    {
      language: z
        .string()
        .optional()
        .describe('The language Fredy should talk to the user in (ISO 639-1, e.g. de or en).'),
      theme: z.enum(['dark', 'light']).optional().describe('Which of the two themes the interface is painted in.'),
      homeAddresses: z
        .array(
          z.object({
            label: z
              .string()
              .optional()
              .describe('A name for the place, e.g. "Home". Defaults to the address or category.'),
            address: z.string().optional().describe('The street address. Needed unless kind is "category".'),
            kind: z
              .enum(['category'])
              .optional()
              .describe('Set to "category" to measure to the nearest place of a kind.'),
            category: z.string().optional().describe('Which kind of place to measure to, e.g. gym or grocery.'),
            mode: z
              .enum(['transit', 'car', 'bike', 'walk'])
              .optional()
              .describe('How the trip is measured. Default: transit.'),
            departure: z
              .object({ time: z.string().optional().describe('The time of day the trip is measured at, "HH:MM".') })
              .optional(),
          }),
        )
        .optional()
        .describe(
          'The places listings are measured against. The FULL list, replacing the previous one - an empty ' +
            'array clears them, and every listing’s distances and travel times are recomputed.',
        ),
      financeProfile: z
        .record(z.string(), z.unknown())
        .nullable()
        .optional()
        .describe(
          'Changes to the finance profile, keyed as get_user_settings shows it, e.g. ' +
            '{"personA": {"primaryIncome": 4000}}. Merged into the stored profile; null clears the whole profile.',
        ),
      applicantProfile: z
        .record(z.string(), z.unknown())
        .nullable()
        .optional()
        .describe(
          'Changes to the applicant profile an application letter is written from, e.g. {"phone": "0170 1234567"}. ' +
            'Merged into the stored profile; null clears the whole profile.',
        ),
    },
    {
      title: 'Change user settings',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (args, extra) => {
      const { user, error } = await authenticateWriteToolCall(extra, 'update_user_settings');
      if (error) return normalizeError(error, 'update_user_settings');

      // Only what the call carries is a change. The rules are the settings pages' own, through the
      // same save; the one thing asked for differently is that the profiles merge, since "set my
      // income to 4000" arrives as the one key that changes.
      const patch = Object.fromEntries(
        ['language', 'theme', 'homeAddresses', 'financeProfile', 'applicantProfile']
          .filter((key) => args[key] !== undefined)
          .map((key) => [key, args[key]]),
      );
      if (Object.keys(patch).length === 0) {
        return normalizeError(
          'Nothing to change. Pass one of language, theme, homeAddresses, financeProfile, applicantProfile.',
          'update_user_settings',
        );
      }

      const saved = await updateUserSettings(user, patch, { mergeProfiles: true });
      if (!saved.ok) return normalizeError(saved.error, 'update_user_settings');

      const { changes } = saved;
      /** @type {string[]} */
      const applied = [];
      if (changes.language !== undefined) applied.push(`language set to ${changes.language}`);
      if (changes.theme !== undefined) applied.push(`theme set to ${changes.theme.value}`);
      if (changes.homeAddresses !== undefined) {
        applied.push(`home addresses saved (${changes.homeAddresses.home_addresses.length})`);
      }
      if (changes.financeProfile !== undefined) {
        applied.push(changes.financeProfile == null ? 'finance profile cleared' : 'finance profile updated');
      }
      if (changes.applicantProfile !== undefined) {
        applied.push(changes.applicantProfile == null ? 'applicant profile cleared' : 'applicant profile updated');
      }

      await trackPoi(TRACKING_POIS.MCP_SETTINGS_CHANGED);
      return normalizeSettingsChanged(applied, 'update_user_settings');
    },
  );

  return server;
}

/**
 * A stored draft, expressed as the patch that would rebuild it from nothing.
 *
 * Finalizing re-runs the same validation the answers went through, so it has to hand it the same
 * shape the answers arrived in - URLs rather than resolved providers.
 *
 * @param {import('./jobDraftStore.js').JobDraft} draft
 * @returns {object}
 */
function toDraftPatch(draft) {
  return {
    name: draft.name ?? undefined,
    providerUrls: draft.providers.map((provider) => provider.url),
    dealType: draft.dealType ?? undefined,
    channelIds: draft.channelIds,
    blacklist: draft.blacklist,
    excludedLocations: draft.excludedLocations,
    specFilter: draft.specFilter,
    commuteFilter: draft.commuteFilter,
    marketFilter: draft.marketFilter,
    priceChangeThreshold: draft.priceChangeThreshold,
    shareWithUsers: draft.shareWithUsers,
    enabled: draft.enabled,
  };
}

/**
 * A stored job, expressed as the draft an edit of it starts from.
 *
 * `update_job` runs the interview's own validation over whatever it is asked to change, so the job
 * as stored has to arrive in the shape that validation reads: providers as the interview resolved
 * them, channels by their ids, filters as they were normalised on the way in.
 *
 * @param {object} job - As returned by `getJob`.
 * @returns {import('./jobDraftStore.js').JobDraft}
 */
function draftFromJob(job) {
  return {
    name: typeof job.name === 'string' ? job.name : null,
    providers: (Array.isArray(job.provider) ? job.provider : [])
      .filter((provider) => provider?.id != null && typeof provider?.url === 'string')
      .map((provider) => ({
        id: provider.id,
        name: provider.name ?? provider.id,
        url: provider.url,
        enabled: provider.enabled !== false,
      })),
    dealType: normalizeDealType(job.dealType),
    channelIds: (Array.isArray(job.notificationAdapter) ? job.notificationAdapter : [])
      .map((ref) => ref?.configuredAdapterId)
      .filter((id) => typeof id === 'string'),
    blacklist: Array.isArray(job.blacklist) ? job.blacklist : [],
    excludedLocations: Array.isArray(job.excludedLocations) ? job.excludedLocations : [],
    specFilter: job.specFilter ?? null,
    commuteFilter: job.commuteFilter ?? null,
    marketFilter: job.marketFilter ?? null,
    priceChangeThreshold: job.priceChangeThreshold ?? null,
    shareWithUsers: Array.isArray(job.shared_with_user) ? job.shared_with_user : [],
    enabled: job.enabled === true,
    // An edit is not an interview: the refinements question was answered when the job was made.
    refinementsAnswered: true,
  };
}
