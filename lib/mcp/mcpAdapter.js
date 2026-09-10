/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { queryJobs, getJob } from '../services/storage/jobStorage.js';
import { queryListings, getListingById } from '../services/storage/listingsStorage.js';
import { authenticateToolCall, checkJobAccess } from './mcpAuthentication.js';
import {
  normalizeListJobs,
  normalizeGetJob,
  normalizeListListings,
  normalizeGetListing,
  normalizeCalculateFinancing,
  normalizeRentAffordability,
  normalizeError,
} from './mcpNormalizer.js';
import { getUserSettings } from '../services/storage/settingsStorage.js';
import { computeFinanceResult } from '../services/finance/calculate.js';
import { normalizeProfile } from '../services/finance/profile.js';
import { computeBudget, netIncomeOf, scoreRentListing } from '../services/finance/affordability.js';
import { DEAL_TYPES } from '../services/dealType.js';
import { filterMask, TECHNOLOGIES, OPERATOR_CODES } from '../services/connectivity/mobileBits.js';

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
 * @returns {McpServer}
 */
export function createMcpServer() {
  const server = new McpServer(
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
        'Always present results to the user as soon as you have them - do NOT call the tool again unless you need additional pages or different data.',
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

      const result = queryListings({
        page: safePage,
        pageSize: safePageSize,
        freeTextFilter: filter,
        jobIdFilter: jobId,
        activityFilter: activeOnly === true ? true : activeOnly === false ? false : undefined,
        providerFilter: provider,
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

      const imageUrl = listing.image_url;
      if (!imageUrl) {
        return normalizeError('No image available for this listing.', 'get_photo_for_listing');
      }

      const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

      let response;
      try {
        response = await fetch(imageUrl, {
          signal: AbortSignal.timeout(10_000),
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'image/jpeg,image/png,image/webp,image/gif,image/*,*/*',
          },
        });
      } catch (fetchErr) {
        return normalizeError(`Failed to fetch image: ${fetchErr.message}`, 'get_photo_for_listing');
      }

      if (!response.ok) {
        return normalizeError(
          `Image fetch returned HTTP ${response.status}. Image URL: ${imageUrl}`,
          'get_photo_for_listing',
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      const headerMimeType = contentType.split(';')[0].trim().toLowerCase();

      let buffer;
      try {
        buffer = await response.arrayBuffer();
      } catch (readErr) {
        return normalizeError(`Failed to read image body: ${readErr.message}`, 'get_photo_for_listing');
      }

      const bytes = new Uint8Array(buffer);

      if (bytes.length < 12) {
        return normalizeError(
          `Downloaded file is too small to determine image type. Image URL: ${imageUrl}`,
          'get_photo_for_listing',
        );
      }

      let resolvedMime;

      if (SUPPORTED_MIME_TYPES.has(headerMimeType)) {
        resolvedMime = headerMimeType;
      } else {
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
          resolvedMime = 'image/jpeg';
        } else if (
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47 &&
          bytes[4] === 0x0d &&
          bytes[5] === 0x0a &&
          bytes[6] === 0x1a &&
          bytes[7] === 0x0a
        ) {
          resolvedMime = 'image/png';
        } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
          resolvedMime = 'image/gif';
        } else if (
          bytes[0] === 0x52 &&
          bytes[1] === 0x49 &&
          bytes[2] === 0x46 &&
          bytes[3] === 0x46 &&
          bytes[8] === 0x57 &&
          bytes[9] === 0x45 &&
          bytes[10] === 0x42 &&
          bytes[11] === 0x50
        ) {
          resolvedMime = 'image/webp';
        } else {
          return normalizeError(
            `Image format not supported by vision models (header: ${headerMimeType || 'unknown'}). Image URL: ${imageUrl}`,
            'get_photo_for_listing',
          );
        }
      }

      const base64 = Buffer.from(buffer).toString('base64');

      return {
        content: [
          {
            type: 'image',
            data: base64,
            mimeType: resolvedMime,
          },
        ],
      };
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

  return server;
}
