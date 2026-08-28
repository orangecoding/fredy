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

import { formatTravelTimes } from '../utils/formatTravelTimes.js';
import { OPERATORS, OPERATOR_CODES, TECHNOLOGIES } from '../services/connectivity/mobileBits.js';

const TECH_LABELS = { '2g': '2G', '4g': '4G', '5g': '5G', '5g_sa': '5G-SA' };

/**
 * One-line summary of a listing's mobile coverage, newest technology first, naming the operators
 * that offer each. Returns null when nothing is covered so callers can omit the line entirely.
 *
 * @param {{neutral?: Record<string, boolean>, operators?: Record<string, Record<string, boolean>>}|null} mobile
 * @returns {string|null}
 */
function formatMobileCoverage(mobile) {
  if (mobile == null) return null;
  const parts = [];
  for (const tech of [...TECHNOLOGIES].reverse()) {
    if (!mobile.neutral?.[tech]) continue;
    const operators = OPERATOR_CODES.filter((code) => mobile.operators?.[code]?.[tech]).map((code) => OPERATORS[code]);
    const who =
      operators.length === 0
        ? 'available'
        : operators.length === OPERATOR_CODES.length
          ? 'all operators'
          : operators.join(', ');
    parts.push(`${TECH_LABELS[tech]} (${who})`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The markdown lines describing a listing's fixed-line and mobile connectivity, or '' when the
 * listing has not been enriched. Reads the parsed `connectivity` JSON that getListingById attaches.
 *
 * @param {{maxDownMbit?: number|null, fiber?: boolean, mobile?: object|null}|null|undefined} connectivity
 * @returns {string}
 */
function formatConnectivity(connectivity) {
  if (connectivity == null) return '';
  let md = '';
  if (connectivity.maxDownMbit != null) {
    md += `- **Downstream:** up to ${connectivity.maxDownMbit} Mbit/s\n`;
  }
  md += `- **Fibre to the building:** ${connectivity.fiber ? 'yes' : 'no'}\n`;
  const mobile = formatMobileCoverage(connectivity.mobile);
  if (mobile != null) {
    md += `- **Mobile coverage:** ${mobile}\n`;
  }
  return md;
}

/**
 * Compact fixed-line cell for the listings table: downstream and a fibre marker, from the flat
 * `connectivity_*` columns that SELECT l.* carries on every list row.
 *
 * @param {{connectivity_max_down?: number|null, connectivity_fiber?: number|null}} listing
 * @returns {string}
 */
function internetCell(listing) {
  if (listing.connectivity_max_down == null) return '–';
  return `${listing.connectivity_max_down} Mbit/s${listing.connectivity_fiber ? ' · fibre' : ''}`;
}

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
  if (hasMore) md += ` More pages available - use page=${page + 1} to continue.`;
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
  md += `- **Deal type:** ${dealTypeLabel(job.dealType)}\n`;
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
  if (hasMore) md += ` More pages available - use page=${page + 1} to continue.`;
  md += '\n\n';

  if (listings.length > 0) {
    md += `| ID | Title | Address | Price | Deal | Size | Provider | Internet | Active | Status | Created | Job |\n`;
    md += `|----|-------|---------|-------|------|------|----------|----------|--------|--------|---------|-----|\n`;
    for (const l of listings) {
      md += `| ${cell(l.id)} | ${cell(l.title)} | ${cell(l.address)} | ${cell(l.price)} | ${dealTypeLabel(l.dealType)} | ${cell(l.size)} | ${cell(l.provider)} | ${cell(internetCell(l))} | ${l.is_active ? 'yes' : 'no'} | ${cell(l.status?.status)} | ${formatDate(l.created_at)} | ${cell(l.job_name)} |\n`;
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
  md += `- **Price:** ${listing.price ?? '–'}${listing.dealType === 'rent' ? ' (monthly rent)' : ''}\n`;
  md += `- **Deal type:** ${dealTypeLabel(listing.dealType)}\n`;
  md += `- **Size:** ${listing.size ?? '–'}\n`;
  md += `- **Year built:** ${listing.build_year ?? '–'}\n`;
  md += `- **Energy class:** ${listing.energy_class || '–'}\n`;
  md += `- **Provider:** ${listing.provider || '–'}\n`;
  md += `- **Link:** ${listing.link || '–'}\n`;
  md += `- **Image:** ${listing.image_url || '–'}\n`;
  md += `- **Active:** ${listing.is_active ? 'yes' : 'no'}\n`;
  md += `- **Status:** ${listing.status?.status || '–'}\n`;
  if (listing.status?.setAt) {
    md += `- **Status set at:** ${formatDate(listing.status.setAt)}\n`;
  }
  md += `- **Created:** ${formatDate(listing.created_at)}\n`;
  md += `- **Job:** ${listing.job_name || '–'}\n`;
  if (listing.latitude != null && listing.longitude != null) {
    md += `- **Location:** ${listing.latitude}, ${listing.longitude}\n`;
  }
  if (Array.isArray(listing.distances) && listing.distances.length > 0) {
    md += `- **Distances:** ${listing.distances.map((d) => `${d.label}: ${d.meters} m`).join(', ')}\n`;
  }
  // Only when a router actually answered. The straight-line distance above is always there, so an
  // absent line means "not routed", never "unreachable".
  const commute = formatTravelTimes(listing.travelTimes);
  if (commute != null) {
    md += `- **Travel time:** ${commute}\n`;
  }
  md += formatConnectivity(listing.connectivity);

  return toMcpResponse(md);
}

/**
 * Human-readable deal type, so a price is never mistaken for the wrong kind of number.
 *
 * @param {'rent'|'buy'|null|undefined} dealType
 * @returns {string}
 */
function dealTypeLabel(dealType) {
  if (dealType === 'rent') return 'renting';
  if (dealType === 'buy') return 'buying';
  return '–';
}

/**
 * Format a number as euros, without the noise of full currency formatting.
 * @param {number|null|undefined} value
 * @returns {string}
 */
function euro(value) {
  if (value == null || !Number.isFinite(Number(value))) return '–';
  return `${Math.round(Number(value)).toLocaleString('de-DE')} EUR`;
}

/**
 * Normalize a calculate_financing response.
 *
 * Leads with the verdict and the monthly rate, because that is the question actually being
 * asked ("can I afford this?"). The breakdown follows for anything that needs justifying.
 *
 * @param {Object} result - Output of computeFinanceResult.
 * @param {{title?: string, id?: string}|null} [listing] - The listing this was run for, if any.
 * @returns {{ content: Array }}
 */
export function normalizeCalculateFinancing(result, listing = null) {
  const { financing, budget, recommendation, verdict, rateShareOfNetIncome } = result;
  const primary = financing.primary;
  const verdictLabel = { affordable: 'AFFORDABLE', stretch: 'A STRETCH', unaffordable: 'OUT OF REACH' }[verdict];

  let md = `**Tool:** calculate_financing | **Status:** OK\n\n`;
  md += `### Verdict: ${verdictLabel}\n\n`;
  if (listing) {
    md += `For listing **${listing.title || listing.id}**.\n\n`;
  }
  md += `Monthly rate **${euro(primary.monthlyPayment)}**`;
  if (rateShareOfNetIncome != null) {
    md += ` (${(rateShareOfNetIncome * 100).toFixed(1)} % of net income, including existing debt)`;
  }
  md += `.\n\n`;

  md += `#### Purchase\n`;
  md += `- **Purchase price:** ${euro(financing.purchasePrice)}\n`;
  md += `- **Grunderwerbsteuer:** ${euro(financing.closingCosts.grunderwerbsteuer)}\n`;
  md += `- **Notar + Grundbuch:** ${euro(financing.closingCosts.notar)}\n`;
  md += `- **Makler:** ${euro(financing.closingCosts.makler)}\n`;
  md += `- **Total cost:** ${euro(financing.totalCost)}\n`;
  md += `- **Eigenkapital:** ${euro(financing.equity)} (${(financing.equityRatio * 100).toFixed(1)} %)\n`;
  md += `- **Loan amount:** ${euro(financing.loanAmount)}\n\n`;

  md += `#### Loan (${primary.annualRate} % Sollzins, ${primary.tilgung} % Tilgung, ${primary.fixedYears} y Zinsbindung)\n`;
  md += `- **Monthly rate:** ${euro(primary.monthlyPayment)}\n`;
  md += `- **Paid off after:** ${primary.payoffMonths == null ? 'never at this rate' : `${(primary.payoffMonths / 12).toFixed(1)} years`}\n`;
  md += `- **Restschuld after Zinsbindung:** ${euro(primary.restschuld)}\n`;
  md += `- **Total interest:** ${euro(primary.totalInterest)}\n\n`;

  if (Array.isArray(result.debtFreeAges) && result.debtFreeAges.length > 0) {
    md += `#### Debt-free age\n`;
    for (const person of result.debtFreeAges) {
      md += `- **${person.label}:** ${person.ageWhenDebtFree == null ? '–' : person.ageWhenDebtFree} (currently ${person.age})\n`;
    }
    md += `\n`;
  }

  md += `#### Budget (35 % rule)\n`;
  md += `- **Net income:** ${euro(budget.netIncome)}\n`;
  md += `- **Living costs:** ${euro(budget.livingCosts)}\n`;
  md += `- **Existing debt service:** ${euro(budget.existingDebtRate)}\n`;
  md += `- **Ceiling for housing (35 %):** ${euro(budget.headroom)}\n`;
  md += `- **Recommended rate:** ${euro(recommendation.recommendedRate)} (limited by ${recommendation.limitedBy})\n`;
  md += `- **Max affordable purchase price:** ${euro(recommendation.maxAffordablePrice)}\n\n`;

  if (financing.scenarios.length > 1) {
    md += `#### Interest scenarios\n\n`;
    md += `| Rate | Tilgung | Monthly | Paid off | Restschuld | Total interest |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    for (const scenario of financing.scenarios) {
      const payoff = scenario.payoffMonths == null ? 'never' : `${(scenario.payoffMonths / 12).toFixed(1)} y`;
      md += `| ${cell(scenario.annualRate)} % | ${cell(scenario.tilgung)} % | ${euro(scenario.monthlyPayment)} | ${payoff} | ${euro(scenario.restschuld)} | ${euro(scenario.totalInterest)} |\n`;
    }
    md += `\n`;
  }

  md += `_Estimate only, based on standard German Kaufnebenkosten. Not financial advice._`;

  return toMcpResponse(md);
}

/**
 * Normalize the answer for a rental: same question ("can I afford this?"), no loan involved.
 *
 * @param {import('../types/finance.js').RentAffordability|null} scored - Output of scoreRentListing.
 * @param {import('../types/finance.js').Budget} budget
 * @param {{title?: string, id?: string}|null} [listing]
 * @returns {{ content: Array }}
 */
export function normalizeRentAffordability(scored, budget, listing = null) {
  if (scored == null) {
    return normalizeError('That listing has no usable rent, so it cannot be judged.', 'calculate_financing');
  }
  const verdictLabel = { affordable: 'AFFORDABLE', stretch: 'A STRETCH', unaffordable: 'OUT OF REACH' }[scored.verdict];

  let md = `**Tool:** calculate_financing | **Status:** OK\n\n`;
  md += `### Verdict: ${verdictLabel}\n\n`;
  if (listing) {
    md += `For listing **${listing.title || listing.id}** - this is a **rental**, so there is no loan to model.\n\n`;
  }
  md += `Warm rent **${euro(scored.warmRent)}**`;
  if (scored.rateShareOfNetIncome != null) {
    md += ` (${(scored.rateShareOfNetIncome * 100).toFixed(1)} % of net income, including existing debt)`;
  }
  md += `.\n\n`;

  md += `#### Rent\n`;
  md += `- **Cold rent (as listed):** ${euro(scored.coldRent)}\n`;
  md += `- **Nebenkosten estimate:** ${euro(scored.nebenkosten)}\n`;
  md += `- **Warm rent:** ${euro(scored.warmRent)}\n`;
  md += `- **Left over each month:** ${euro(scored.remainingAfterRent)}\n\n`;

  md += `#### Budget (35 % rule)\n`;
  md += `- **Net income:** ${euro(budget.netIncome)}\n`;
  md += `- **Living costs:** ${euro(budget.livingCosts)}\n`;
  md += `- **Existing debt service:** ${euro(budget.existingDebtRate)}\n`;
  md += `- **Ceiling for housing (35 %):** ${euro(budget.headroom)}\n\n`;

  md += `_Estimate only. The Nebenkosten are a percentage assumption, not the landlord's actual figure._`;

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
