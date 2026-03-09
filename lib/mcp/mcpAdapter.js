/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

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
  normalizeError,
} from './mcpNormalizer.js';

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
        'Fredy MCP Server – query real estate jobs and listings. ' +
        'All timestamps are unix timestamps in milliseconds (e.g. 1772008362564). ' +
        'Use list_jobs to browse jobs, get_job for details, ' +
        'list_listings to search listings (supports time filters like createdAfter/createdBefore), ' +
        'and get_listing for full details of a single listing. ' +
        'Responses are formatted as markdown with a summary, data (tables for lists, key-value for details), and pagination info. ' +
        'Always present results to the user as soon as you have them — do NOT call the tool again unless you need additional pages or different data.',
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
      sortField: z.string().optional().describe('Sort by: created_at, price, size, provider, title, is_active'),
      sortDir: z.string().optional().describe('Sort direction: asc or desc'),
    },
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
      },
      extra,
    ) => {
      const { user, error } = authenticateToolCall(extra, 'list_listings');
      if (error) return normalizeError(error, 'list_listings');

      const safePage = page ?? 1;
      const safePageSize = pageSize ?? 50;

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

  // ── get_current_date_ime ─────────────────────────────────────────────────────
  server.tool('get_current_date_time', 'Returns the current date and time.', {}, () => {
    return {
      content: [{ type: 'text', text: `Timestring: ${new Date().toLocaleString()}, MS since 1970: ${Date.now()}` }],
    };
  });

  return server;
}
