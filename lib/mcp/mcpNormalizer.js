/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * MCP Response Normalizer
 *
 * Transforms raw adapter data into LLM-friendly markdown responses.
 * Markdown is significantly better than JSON for LLM consumption because:
 * - LLMs are trained extensively on markdown text
 * - Markdown tables are ~40-60% more token-efficient than JSON arrays
 * - Less syntactic noise (no quotes, brackets, commas around every value)
 * - Natively readable and structured
 *
 * Each response follows a consistent structure:
 * 1. Status line (OK/ERROR + tool name)
 * 2. Summary (human-readable description)
 * 3. Data (markdown table for lists, key-value for single items)
 * 4. Pagination info (for list responses)
 */

/**
 * Wrap a markdown string as an MCP text content result.
 * @param {string} markdown
 * @param {boolean} [isError=false]
 * @returns {{ content: Array, isError?: boolean }}
 */
function toMcpResponse(markdown, isError = false) {
  const result = {
    content: [{ type: 'text', text: markdown }],
  };
  if (isError) result.isError = true;
  return result;
}

/**
 * Format a unix timestamp (ms) as a human-readable date string.
 * @param {number|null|undefined} ts
 * @returns {string}
 */
function formatDate(ts) {
  if (ts == null) return '–';
  return new Date(ts)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}

/**
 * Escape pipe characters in table cell values.
 * @param {*} val
 * @returns {string}
 */
function cell(val) {
  if (val == null) return '–';
  return String(val).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Normalize a list_jobs response.
 * @param {{ totalNumber: number, page: number, result: object[] }} queryResult
 * @param {{ page: number, pageSize: number }} params
 * @returns {{ content: Array }}
 */
export function normalizeListJobs(queryResult, { page, pageSize }) {
  const maxPage = Math.max(1, Math.ceil(queryResult.totalNumber / pageSize));
  const hasMore = page < maxPage;
  const jobs = queryResult.result;

  let md = `**Tool:** list_jobs | **Status:** OK\n\n`;
  md += `Found **${queryResult.totalNumber}** job(s). Showing page ${page} of ${maxPage} (${jobs.length} on this page).`;
  if (hasMore) md += ` More pages available — use page=${page + 1} to continue.`;
  md += '\n\n';

  if (jobs.length > 0) {
    md += `| ID | Name | Enabled | Active Listings |\n`;
    md += `|----|------|---------|----------------|\n`;
    for (const j of jobs) {
      md += `| ${cell(j.id)} | ${cell(j.name)} | ${j.enabled ? 'yes' : 'no'} | ${j.numberOfFoundListings ?? 0} |\n`;
    }
  } else {
    md += `No jobs found.\n`;
  }

  md += `\n**Page:** ${page}/${maxPage} | **Has more:** ${hasMore ? 'yes' : 'no'}`;
  return toMcpResponse(md);
}

/**
 * Normalize a get_job response.
 * @param {object} job - The job object from storage.
 * @returns {{ content: Array }}
 */
export function normalizeGetJob(job) {
  const providers = (job.provider ?? []).map((p) => p.id || p);

  let md = `**Tool:** get_job | **Status:** OK\n\n`;
  md += `### Job: ${job.name || job.id}\n\n`;
  md += `- **ID:** ${job.id}\n`;
  md += `- **Name:** ${job.name || '–'}\n`;
  md += `- **Enabled:** ${job.enabled ? 'yes' : 'no'}\n`;
  md += `- **Active Listings:** ${job.numberOfFoundListings ?? 0}\n`;
  md += `- **Providers:** ${providers.length > 0 ? providers.join(', ') : '–'}\n`;
  md += `- **Blacklist:** ${(job.blacklist ?? []).length > 0 ? job.blacklist.join(', ') : '–'}\n`;

  return toMcpResponse(md);
}

/**
 * Normalize a list_listings response.
 * @param {{ totalNumber: number, page: number, result: object[] }} queryResult
 * @param {{ page: number, pageSize: number }} params
 * @returns {{ content: Array }}
 */
export function normalizeListListings(queryResult, { page, pageSize }) {
  const maxPage = Math.max(1, Math.ceil(queryResult.totalNumber / pageSize));
  const hasMore = page < maxPage;
  const listings = queryResult.result;

  let md = `**Tool:** list_listings | **Status:** OK\n\n`;
  md += `Found **${queryResult.totalNumber}** listing(s). Showing page ${page} of ${maxPage} (${listings.length} on this page).`;
  if (hasMore) md += ` More pages available — use page=${page + 1} to continue.`;
  md += '\n\n';

  if (listings.length > 0) {
    md += `| ID | Title | Address | Price | Size | Provider | Active | Created | Job |\n`;
    md += `|----|-------|---------|-------|------|----------|--------|---------|-----|\n`;
    for (const l of listings) {
      md += `| ${cell(l.id)} | ${cell(l.title)} | ${cell(l.address)} | ${cell(l.price)} | ${cell(l.size)} | ${cell(l.provider)} | ${l.is_active ? 'yes' : 'no'} | ${formatDate(l.created_at)} | ${cell(l.job_name)} |\n`;
    }
    md += `\nUse **get_listing** with an ID for full details (description, link, image).\n`;
  } else {
    md += `No listings found.\n`;
  }

  md += `\n**Page:** ${page}/${maxPage} | **Has more:** ${hasMore ? 'yes' : 'no'}`;
  return toMcpResponse(md);
}

/**
 * Normalize a get_listing response.
 * @param {object} listing - The listing object from storage.
 * @returns {{ content: Array }}
 */
export function normalizeGetListing(listing) {
  let md = `**Tool:** get_listing | **Status:** OK\n\n`;
  md += `### Listing: ${listing.title || listing.id}\n\n`;
  md += `- **ID:** ${listing.id}\n`;
  md += `- **Title:** ${listing.title || '–'}\n`;
  md += `- **Description:** ${listing.description || '–'}\n`;
  md += `- **Address:** ${listing.address || '–'}\n`;
  md += `- **Price:** ${listing.price ?? '–'}\n`;
  md += `- **Size:** ${listing.size ?? '–'}\n`;
  md += `- **Provider:** ${listing.provider || '–'}\n`;
  md += `- **Link:** ${listing.link || '–'}\n`;
  md += `- **Image:** ${listing.image_url || '–'}\n`;
  md += `- **Active:** ${listing.is_active ? 'yes' : 'no'}\n`;
  md += `- **Created:** ${formatDate(listing.created_at)}\n`;
  md += `- **Job:** ${listing.job_name || '–'}\n`;
  if (listing.latitude != null && listing.longitude != null) {
    md += `- **Location:** ${listing.latitude}, ${listing.longitude}\n`;
  }
  if (listing.distance_to_destination != null) {
    md += `- **Distance to destination:** ${listing.distance_to_destination}\n`;
  }

  return toMcpResponse(md);
}

/**
 * Normalize an error response.
 * @param {string} message - The error message.
 * @param {string} [tool] - Optional tool name for context.
 * @returns {{ content: Array, isError: boolean }}
 */
export function normalizeError(message, tool) {
  const md = `**Tool:** ${tool ?? 'unknown'} | **Status:** ERROR\n\n${message}`;
  return toMcpResponse(md, true);
}
