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
 *
 * Shows every field `update_job` can change, because that tool takes the complete list for anything
 * it edits: a model that cannot read the current channels or filters here cannot build the full
 * replacement list there.
 *
 * @param {object} job - The job object from storage.
 * @returns {{ content: Array }}
 */
export function normalizeGetJob(job) {
  // The URLs themselves, not just the portal names: `providerUrls` is the complete list, so adding
  // one portal means resending every search already there.
  const searches = (job.provider ?? []).map((p) =>
    typeof p === 'object' && p != null
      ? `${p.name || p.id}: ${p.url ?? '–'}${p.enabled === false ? ' (switched off)' : ''}`
      : String(p),
  );
  const channels = (job.notificationAdapter ?? []).map((channel) => `${channel.name} (${channel.configuredAdapterId})`);
  const spec = job.specFilter ?? null;

  let md = `**Tool:** get_job | **Status:** OK\n\n`;
  md += `### Job: ${job.name || job.id}\n\n`;
  md += `- **ID:** ${job.id}\n`;
  md += `- **Name:** ${job.name || '–'}\n`;
  md += `- **Enabled:** ${job.enabled ? 'yes' : 'no'}\n`;
  md += `- **Active Listings:** ${job.numberOfFoundListings ?? 0}\n`;
  md += `- **Deal type:** ${dealTypeLabel(job.dealType)}\n`;
  md += `- **Search URLs (providerUrls):** ${searches.length > 0 ? '' : '–'}\n`;
  for (const search of searches) md += `  - ${search}\n`;
  md += `- **Notify via:** ${channels.length > 0 ? channels.join(', ') : '–'}\n`;
  md += `- **Blacklist:** ${(job.blacklist ?? []).length > 0 ? job.blacklist.join(', ') : '–'}\n`;
  md += `- **Excluded locations:** ${(job.excludedLocations ?? []).join(', ') || '–'}\n`;
  md += `- **Filters:** ${
    spec == null
      ? '–'
      : [
          spec.maxPrice != null ? `max price ${spec.maxPrice}` : null,
          spec.minSize != null ? `min ${spec.minSize} m²` : null,
          spec.minRooms != null ? `min ${spec.minRooms} rooms` : null,
        ]
          .filter(Boolean)
          .join(', ') || '–'
  }\n`;
  md += `- **Commute limits:** ${
    job.commuteFilter == null
      ? '–'
      : `${Object.entries(job.commuteFilter.limits ?? {})
          .map(([label, minutes]) => `${label} ≤ ${minutes} min`)
          .join(', ')} (${job.commuteFilter.action})`
  }\n`;
  md += `- **Market target:** ${
    job.marketFilter == null
      ? '–'
      : `${
          [
            job.marketFilter.minBelowMarketPercent != null
              ? `at least ${job.marketFilter.minBelowMarketPercent} % below the local median`
              : null,
            job.marketFilter.minYieldPercent != null
              ? `gross yield of at least ${job.marketFilter.minYieldPercent} %`
              : null,
          ]
            .filter(Boolean)
            .join(', ') || '–'
        } (${job.marketFilter.action})`
  }\n`;
  md += `- **Price change alerts from:** ${
    job.priceChangeThreshold == null ? 'instance default' : `${job.priceChangeThreshold} %`
  }\n`;
  md += `- **Shared with:** ${(job.shared_with_user ?? []).join(', ') || '–'}\n`;
  md += `- **Area filter:** ${job.spatialFilter ? 'yes (drawn on the map - only the web UI can change it)' : 'no'}\n`;
  md += `- **Last run:** ${formatDate(job.lastRunAt)}\n`;

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
    md += `| ID | Title | Address | Price | Deal | Size | Provider | Internet | Active | Status | Listed | Found | Job |\n`;
    md += `|----|-------|---------|-------|------|------|----------|----------|--------|--------|--------|-------|-----|\n`;
    for (const l of listings) {
      // Listed is the date the portal itself states, which is the order the web UI reads in; Found
      // is when Fredy first stored the row. They differ whenever a flat is discovered late.
      md += `| ${cell(l.id)} | ${cell(l.title)} | ${cell(l.address)} | ${cell(l.price)}${l.price != null && l.currency ? ` ${cell(l.currency)}` : ''} | ${dealTypeLabel(l.dealType)} | ${cell(l.size)} | ${cell(l.provider)} | ${cell(internetCell(l))} | ${l.is_active ? 'yes' : 'no'} | ${cell(l.status?.status)} | ${l.published_at != null ? formatDate(l.published_at) : '–'} | ${formatDate(l.created_at)} | ${cell(l.job_name)} |\n`;
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
  md += `- **Price:** ${listing.price ?? '–'}${listing.price != null && listing.currency ? ` ${listing.currency}` : ''}${listing.dealType === 'rent' ? ' (monthly rent)' : ''}\n`;
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
  if (listing.published_at != null) {
    md += `- **Listed:** ${formatDate(listing.published_at)}\n`;
  }
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
 * The rent is named for what it is. A listing that quotes it with the charges in it gets no "cold
 * rent" line for it and no Nebenkosten estimate - an assistant reading either would add the charges a
 * second time - but the charges and the cold rent they leave where the advert states them.
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
  if (scored.chargesIncluded) {
    md += `- **Rent incl. charges (as listed):** ${euro(scored.price)}\n`;
    md +=
      scored.nebenkosten == null
        ? `- **Charges:** included in the rent, not stated separately\n`
        : `- **Charges (as stated):** ${euro(scored.nebenkosten)}\n`;
    if (scored.coldRent != null) {
      md += `- **Cold rent (listed rent minus stated charges):** ${euro(scored.coldRent)}\n`;
    }
  } else {
    md += `- **Cold rent (as listed):** ${euro(scored.coldRent)}\n`;
    md += `- **Nebenkosten estimate:** ${euro(scored.nebenkosten)}\n`;
  }
  md += `- **Warm rent:** ${euro(scored.warmRent)}\n`;
  md += `- **Left over each month:** ${euro(scored.remainingAfterRent)}\n\n`;

  md += `#### Budget (35 % rule)\n`;
  md += `- **Net income:** ${euro(budget.netIncome)}\n`;
  md += `- **Living costs:** ${euro(budget.livingCosts)}\n`;
  md += `- **Existing debt service:** ${euro(budget.existingDebtRate)}\n`;
  md += `- **Ceiling for housing (35 %):** ${euro(budget.headroom)}\n\n`;

  md += scored.chargesIncluded
    ? `_Estimate only. The listing quotes the rent with the charges included, so no Nebenkosten surcharge is added._`
    : `_Estimate only. The Nebenkosten are a percentage assumption, not the landlord's actual figure._`;

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

/**
 * Normalize a note write.
 *
 * The full stored text is echoed rather than only what was added: the caller appended blind, and
 * this is the only way for it to read back what the listing now actually says without a second
 * round trip through get_listing.
 *
 * @param {object} listing - The listing, as it was before the write.
 * @param {string|null} notes - The text now stored, or null/empty when the notes were cleared.
 * @param {string} tool - Which of the two note tools is answering.
 * @returns {{ content: Array }}
 */
export function normalizeListingNotes(listing, notes, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `### Listing: ${listing.title || listing.id}\n\n`;
  md += `- **ID:** ${listing.id}\n`;
  if (notes == null || String(notes).trim().length === 0) {
    md += `\nNotes cleared.\n`;
  } else {
    md += `- **Notes (now):**\n\n${notes}\n`;
  }
  return toMcpResponse(md);
}

/**
 * Normalize a watchlist change.
 *
 * `changed` is what separates "this call did it" from "it was already like that". Both are success:
 * a client that retries a watch must not be told it failed, and must not be told it undid anything.
 *
 * @param {object} listing
 * @param {{ watched: boolean, changed: boolean }} state
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeWatch(listing, { watched, changed }, tool) {
  const name = `**${listing.title || listing.id}** (${listing.id})`;
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  if (watched) {
    md += changed ? `Listing ${name} is now on your watchlist.` : `Listing ${name} was already on your watchlist.`;
  } else {
    md += changed ? `Listing ${name} was removed from your watchlist.` : `Listing ${name} was not on your watchlist.`;
  }
  return toMcpResponse(md);
}

/**
 * Normalize a job-draft response.
 *
 * Every answer echoes the whole draft back. The alternative - reporting only what changed - asks
 * the model to keep the running total itself, which is exactly the bookkeeping the server-side
 * draft exists to take away from it.
 *
 * @param {object} params
 * @param {import('./jobDraftStore.js').DraftContext} params.context
 * @param {import('./jobDraftStore.js').DraftStep} params.step
 * @param {string[]} [params.problems] - Why the update was refused, if it was.
 * @param {boolean} [params.reference] - Whether to list the portals, channels, addresses and users
 *   this instance offers. Worth the tokens once, at the start of the interview.
 * @param {string} params.summary - The rendered draft, from `describeDraft`.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeJobDraft({ context, step, problems = [], reference = false, summary }, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `### Job draft\n\n${summary}\n`;

  if (problems.length > 0) {
    md += `\n#### Problems\n\nNothing was changed. Fix these and call update_job_draft again:\n\n`;
    for (const problem of problems) md += `- ${problem}\n`;
  }

  if (reference) {
    md += `\n#### Supported portals\n\n| Portal | Host |\n|--------|------|\n`;
    for (const provider of context.providers) {
      md += `| ${cell(provider.name)} | ${cell(hostOf(provider.baseUrl))} |\n`;
    }

    md += `\n#### Your notification channels\n\n`;
    if (context.channels.length === 0) {
      md += `None yet. One is required; they are created in the web UI under Settings → Notifications.\n`;
    } else {
      md += `| ID | Name | Type |\n|----|------|------|\n`;
      for (const channel of context.channels) {
        md += `| ${cell(channel.id)} | ${cell(channel.name)} | ${cell(channel.adapterId)} |\n`;
      }
    }

    md += `\n#### Your saved addresses\n\n${
      context.addresses.length > 0 ? context.addresses.join(', ') : 'None - travel-time limits are unavailable.'
    }\n`;

    md += `\n#### Users you can share with\n\n${
      context.shareableUsers.length > 0
        ? context.shareableUsers.map((user) => `${user.id} (${user.name})`).join(', ')
        : 'None.'
    }\n`;
  }

  md += `\n#### Next question\n\nAsk the user this, and nothing else, in their own language:\n\n> ${step.question}\n`;
  if (step.key !== 'ready') {
    md += `\nPass their answer to **update_job_draft** (\`${step.key}\`). Do not guess values they have not given.\n`;
  }
  return toMcpResponse(md);
}

/**
 * Normalize the job that an interview produced.
 *
 * @param {object} job - As read back from storage.
 * @returns {{ content: Array }}
 */
export function normalizeJobCreated(job) {
  const providers = (job.provider ?? []).map((p) => p.name || p.id || p);

  let md = `**Tool:** create_job_from_draft | **Status:** OK\n\n`;
  md += `### Job created: ${job.name || job.id}\n\n`;
  md += `- **ID:** ${job.id}\n`;
  md += `- **Enabled:** ${job.enabled ? 'yes' : 'no'}\n`;
  md += `- **Deal type:** ${dealTypeLabel(job.dealType)}\n`;
  md += `- **Portals:** ${providers.length > 0 ? providers.join(', ') : '–'}\n`;
  md += `- **Blacklist:** ${(job.blacklist ?? []).length > 0 ? job.blacklist.join(', ') : '–'}\n`;
  md += `- **Excluded locations:** ${(job.excludedLocations ?? []).join(', ') || '–'}\n`;

  md += `\n#### Next steps\n\n`;
  md += `- The job runs at the next scheduled interval; it is not run now.\n`;
  md += `- An area filter (a shape on the map) can only be drawn in the web UI: Jobs → edit this job → Refine → Area filter.\n`;
  return toMcpResponse(md);
}

/**
 * The host of a provider's base URL, for the portal table. Kept local rather than imported from the
 * job-URL check: this one only has to be readable, not to decide anything.
 *
 * @param {string} baseUrl
 * @returns {string}
 */
function hostOf(baseUrl) {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./i, '');
  } catch {
    return baseUrl;
  }
}

/**
 * Normalize a discarded draft. Both outcomes are success: a client that discards twice has got
 * what it asked for.
 *
 * @param {boolean} discarded - Whether there was a draft to throw away.
 * @returns {{ content: Array }}
 */
export function normalizeDraftDiscarded(discarded) {
  const md = `**Tool:** discard_job_draft | **Status:** OK\n\n${
    discarded ? 'Draft discarded. Nothing was created.' : 'There was no draft to discard.'
  }`;
  return toMcpResponse(md);
}

/**
 * The longest unbroken run of backticks in a text, so a fence can be chosen that clears it.
 *
 * At least three, because a shorter fence is not a fence.
 *
 * @param {string} text
 * @returns {number}
 */
function longestBacktickRun(text) {
  let longest = 3;
  for (const run of String(text ?? '').matchAll(/`+/g)) {
    longest = Math.max(longest, run[0].length);
  }
  return longest;
}

/**
 * A value as a fenced JSON block, the fence sized past any backticks inside it: the applicant
 * profile is free text the user wrote, and a run of backticks in it must not close the block early.
 *
 * @param {unknown} value
 * @returns {string} The block, ending in a newline.
 */
function jsonBlock(value) {
  const json = JSON.stringify(value, null, 2);
  const fence = '`'.repeat(longestBacktickRun(json) + 1);
  return `${fence}json\n${json}\n${fence}\n`;
}

/**
 * Normalize a drafted application letter.
 *
 * The letter goes in a fenced block so the model hands it over as written rather than paraphrasing
 * it; a letter re-worded on the way to the user is not the letter Fredy validated against the
 * template and the profile.
 *
 * What the profile is still missing is reported after the letter rather than before it. A model
 * that reads "your profile is incomplete" first tends to answer with that instead of the text the
 * user asked for, and the letter is useful either way.
 *
 * @param {object} listing - The listing the letter is for.
 * @param {import('../services/application/applicationService.js').ApplicationLetter} letter
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeApplicationLetter(listing, letter, tool) {
  // Everything interpolated here is written by somebody else - the portal wrote the title, the
  // user wrote their own profile - and it lands in a response the model is being told to trust.
  // `cell` strips the newlines a title would otherwise use to start a line of its own, and the
  // fence is sized past anything in the letter so the letter cannot close it early.
  const fence = '`'.repeat(longestBacktickRun(letter.text) + 1);

  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `### Application letter for: ${cell(listing.title || listing.id)}\n\n`;
  md += `- **Listing ID:** ${cell(listing.id)}\n`;
  md += `- **Language:** ${cell(letter.language)}`;
  md += letter.contact?.name ? ` | **Addressed to:** ${cell(letter.contact.name)}\n` : `\n`;
  md += `- **Deal type:** ${cell(letter.dealType)}\n\n`;

  md += `Pass this text on to the user exactly as it is. Do not rewrite or translate it.\n\n`;
  md += `${fence}\n${letter.text}\n${fence}\n`;

  if (!letter.hasProfile) {
    md += `\nThere is **no applicant profile** stored yet, so the letter carries only the listing's own`;
    md += ` details. Tell the user they can fill one in under Settings -> Application, which is what`;
    md += ` adds their name, household, occupation and income to every letter.\n`;
  } else if (letter.missing.length > 0) {
    md += `\n**Missing profile fields** the letter would have used: ${letter.missing.join(', ')}.`;
    md += ` Mention these to the user so they can complete their profile under Settings -> Application.\n`;
  }

  if (letter.unknown.length > 0) {
    md += `\n**Unknown placeholders** in the user's own template, left in the text as written:`;
    md += ` ${letter.unknown.join(', ')}.\n`;
  }

  return toMcpResponse(md);
}

/**
 * Normalize an accepted job run.
 *
 * The run itself happens in the background - the tool answers the moment it is queued, exactly as
 * the web UI's "Run now" does - so what the model needs to know is where to look for the outcome.
 * `jobs` null means "all of them", which only the run-all tool passes.
 *
 * @param {Array<{id: string, name: string}>|null} jobs - The job(s) being run, or null for all.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeRunStarted(jobs, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md +=
    jobs == null
      ? `Run started for every job the user is allowed to run.`
      : `Run started for ${jobs.map((job) => `**${job.name || job.id}** (${job.id})`).join(', ') || 'no jobs'}.`;
  md += ` It runs in the background - new listings go to the job's notification channels, and appear under list_listings a few minutes later.`;
  return toMcpResponse(md);
}

/**
 * Normalize an enable/disable change on a job.
 *
 * `changed` separates "this call did it" from "it was already like that", the same way the watch
 * tools do: a repeated call is a success, not an error, and not an undo.
 *
 * @param {object} job
 * @param {{ enabled: boolean, changed: boolean }} state
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeJobStatus(job, { enabled, changed }, tool) {
  const name = `**${job.name || job.id}** (${job.id})`;
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += changed
    ? `${name} is now ${enabled ? 'enabled' : 'disabled'}.`
    : `${name} was already ${enabled ? 'enabled' : 'disabled'}. Nothing changed.`;
  if (!enabled) {
    md += ` Disabled jobs are skipped by the scheduler until switched back on.`;
  }
  return toMcpResponse(md);
}

/**
 * Normalize a job edit.
 *
 * The whole merged job is echoed as the interview's draft summary renders it, so the model can
 * read back what the job now says without a second round trip through get_job.
 *
 * @param {object} job - The job as read back from storage.
 * @param {{ summary: string }} rendered - `describeDraft` over the merged draft.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeJobUpdated(job, { summary }, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `### Job updated: ${job.name || job.id}\n\n`;
  md += `${summary}\n`;
  md += `\nThe job's area filter (a shape drawn on the map) cannot be changed here - the existing one is kept, and the web UI is where a new one is drawn.\n`;
  return toMcpResponse(md);
}

/**
 * Normalize a deleted job.
 *
 * @param {object} job - The job as it was before deletion.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeJobDeleted(job, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `Job **${job.name || job.id}** (${job.id}) and all of its listings have been removed.`;
  return toMcpResponse(md);
}

/**
 * Normalize the channel list.
 *
 * `fields` never appears here at all, not even masked: the table has no use for a bot token, and
 * the surest way not to leak one is not to render it. What each channel *leads to* is there
 * instead, from `describeChannel`, which cannot surface a secret either.
 *
 * @param {Array<{id: string, adapterId: string, adapterName: string, name: string, destination: string|null, visibility: string, usedByJobs: number, canEdit: boolean, isOwner: boolean}>} channels
 * @returns {{ content: Array }}
 */
export function normalizeListChannels(channels) {
  let md = `**Tool:** list_channels | **Status:** OK\n\n`;
  md += `Found **${channels.length}** notification channel(s) you may use.\n\n`;
  if (channels.length > 0) {
    md += `| ID | Name | Type | Destination | Visibility | Used by jobs | Yours to edit |\n`;
    md += `|----|------|------|-------------|------------|--------------|---------------|\n`;
    for (const channel of channels) {
      md += `| ${cell(channel.id)} | ${cell(channel.name)} | ${cell(channel.adapterName)} | ${cell(channel.destination)} | ${cell(channel.visibility)} | ${channel.usedByJobs} | ${channel.canEdit ? 'yes' : 'no'} |\n`;
    }
    md += `\nChannel field values (tokens, chat ids) are never shown. Pass a channel ID where a job asks for one.\n`;
  } else {
    md += `No channels yet. Create one with **create_channel**, or under Settings -> Notifications in the web UI.\n`;
  }
  return toMcpResponse(md);
}

/**
 * Normalize the adapter catalog - the field definitions a new channel asks for.
 *
 * Definitions only, never values: nothing here is anybody's secret, because nothing here is data.
 *
 * @param {Array<{id: string, name: string, description?: string, fields?: Record<string, object>}>} adapters
 * @returns {{ content: Array }}
 */
export function normalizeListAdapters(adapters) {
  let md = `**Tool:** list_adapters | **Status:** OK\n\n`;
  md += `Fredy can notify through **${adapters.length}** adapter type(s).\n`;
  for (const adapter of adapters) {
    md += `\n#### ${adapter.name} (${adapter.id})\n\n`;
    if (adapter.description) md += `${cell(adapter.description)}\n`;
    const fields = Object.entries(adapter.fields ?? {});
    if (fields.length === 0) {
      md += `No fields - it works as configured.\n`;
      continue;
    }
    md += `| Field | Type | Notes |\n|-------|------|-------|\n`;
    for (const [key, definition] of fields) {
      const notes = [
        definition?.target ? 'destination' : null,
        definition?.secret ? 'secret - never shown back' : null,
        definition?.generated ? 'created by Fredy - never set by hand' : null,
        definition?.urlPath ? `served under ${definition.urlPath}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      md += `| ${cell(key)} | ${cell(definition?.type ?? 'text')} | ${cell(notes) || '–'} |\n`;
    }
  }
  md += `\nPass these field names and the adapter ID to **create_channel**.\n`;
  return toMcpResponse(md);
}

/**
 * Normalize a saved channel - the one answer for creating and updating.
 *
 * Echoes what was stored except the field values themselves: a token or a feed url the model
 * cannot read back is one it cannot leak, and the user can always read them in the web UI.
 *
 * @param {object} channel - As read back from storage.
 * @param {{ created: boolean, destination: string|null, adapterName: string }} shape
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeChannelSaved(channel, { created, destination, adapterName }, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `### Channel ${created ? 'created' : 'updated'}: ${channel.name}\n\n`;
  md += `- **ID:** ${channel.id}\n`;
  md += `- **Type:** ${cell(adapterName)}\n`;
  md += `- **Destination:** ${cell(destination) || '–'}\n`;
  md += `- **Visibility:** ${cell(channel.visibility)}\n`;
  md += `\nField values are stored but never shown back - secret ones (tokens, feed urls) cannot be read over MCP at all. Test what was stored with **test_channel**.\n`;
  return toMcpResponse(md);
}

/**
 * Normalize a channel test fire.
 *
 * @param {object} channel
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeChannelTested(channel, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `A test listing was sent through **${channel.name}** (${channel.id}). If the user has not received it within a minute or two, the channel's stored values are wrong.`;
  return toMcpResponse(md);
}

/**
 * Normalize a channel deletion.
 *
 * @param {object} channel - As it was before deletion.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeChannelDeleted(channel, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += `Notification channel **${channel.name}** (${channel.id}) has been removed.`;
  return toMcpResponse(md);
}

/**
 * Normalize a listing status change.
 *
 * @param {object} listing
 * @param {('applied'|'rejected'|'accepted'|null)} status - The status now stored, null when cleared.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeListingStatus(listing, status, tool) {
  const name = `**${listing.title || listing.id}** (${listing.id})`;
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md +=
    status == null
      ? `${name} no longer carries a status.`
      : `${name} is now marked as **${status}**, and is on the watchlist.`;
  return toMcpResponse(md);
}

/**
 * Normalize a listing deletion.
 *
 * The default is the soft delete - the row is hidden and can be restored in the web UI - so the
 * answer says which of the two happened rather than a bare "deleted".
 *
 * `alreadyHidden` is a soft delete asked for a listing that was hidden before the call: a success,
 * since the listing is where the user wanted it, but not a change, and the answer says so.
 *
 * @param {object} listing - As it was before deletion.
 * @param {{ hard: boolean, alreadyHidden?: boolean }} state
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeListingDeleted(listing, { hard, alreadyHidden = false }, tool) {
  const name = `**${listing.title || listing.id}** (${listing.id})`;
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  if (hard) {
    md += `${name} has been permanently removed.`;
  } else if (alreadyHidden) {
    md += `${name} was already hidden. Nothing changed - restore it in the web UI, or delete it for good by calling again with hard=true.`;
  } else {
    md += `${name} has been removed. It is only hidden - restore it in the web UI, or delete it for good by calling again with hard=true.`;
  }
  return toMcpResponse(md);
}

/**
 * Normalize the outcome of adding a listing by its URL.
 *
 * Everything but `created` and `duplicate` is an error the model can act on, so each status gets
 * its own sentence rather than one generic failure.
 *
 * @param {import('../services/listings/manualListingService.js').AddListingResult} result
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeAddListing(result, tool) {
  const provider = result.provider ? ` (read through ${result.provider})` : '';
  if (result.status === 'created') {
    let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
    md += `Listing stored with ID **${result.listingId}**${provider}. `;
    md += `It is in the job you named, complete with distances and travel times; get_listing will show it in a moment, once the enrichment steps have caught up.`;
    return toMcpResponse(md);
  }
  if (result.status === 'duplicate') {
    let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
    md += `You already have this advert: listing **${result.listingId}**`;
    if (result.jobName) md += ` in job "${cell(result.jobName)}"`;
    md += `. Nothing new was stored.`;
    return toMcpResponse(md);
  }

  const message = {
    invalidUrl: 'That is not a URL Fredy may open. Paste the advert page address straight from the browser.',
    forbidden: 'There is no such job, or it is not one you may add listings to. Call list_jobs and pick one of yours.',
    unknownPortal: 'No supported portal serves that address.',
    unsupported:
      'The portal exists, but Fredy cannot read a single advert from it yet - only searches. Tell the user this one has to be added by hand.',
    unreadable:
      'The portal answered, but the page holds no single advert - it may be a search page, a bot wall, or taken down.',
    project:
      'That page is a new-build project with several units rather than one advert, so there is nothing to store.',
    busy: 'Another add for this user is still running. Try again once it has finished.',
    failed: 'Reading the page failed. The log has the detail; trying again in a minute is reasonable, twice is not.',
  }[result.status];
  return normalizeError(message ?? `Could not add the listing (${result.status}).`, tool);
}

/**
 * Normalize the personal settings a user can read and change.
 *
 * Only the settings `update_user_settings` can write are shown: a setting the model can see but
 * never change is a question it can only answer with "use the web UI". The reverse holds too, so
 * both profiles are shown in full, as the JSON the update tool merges into: a model that only knew
 * a profile was "saved" could not name the key it was asked to change. Nothing here belongs to
 * anyone but the caller, who is the only one these are ever read for.
 *
 * @param {Record<string, any>} settings - The compiled user settings row.
 * @returns {{ content: Array }}
 */
export function normalizeUserSettings(settings) {
  const addresses = (settings.home_addresses ?? []).map((a) =>
    a?.kind === 'category'
      ? `${a.label || a.category} (nearest ${a.category})`
      : `${a.label || a.address}: ${a.address}${a.mode && a.mode !== 'transit' ? ` by ${a.mode}` : ''}`,
  );

  let md = `**Tool:** get_user_settings | **Status:** OK\n\n`;
  md += `- **Language:** ${cell(settings.language) || 'default'}\n`;
  md += `- **Theme:** ${cell(settings.theme ?? 'dark')}\n`;
  md += `- **Addresses:** ${addresses.length > 0 ? addresses.join(' · ') : 'none yet'}\n`;
  md += `- **Finance profile:** ${settings.finance_profile ? 'saved, below' : 'not set'}\n`;
  md += `- **Applicant profile:** ${settings.applicant_profile ? 'saved, below' : 'not set'}\n`;

  if (settings.finance_profile) {
    md += `\n#### Finance profile\n\n${jsonBlock(settings.finance_profile)}`;
  }
  if (settings.applicant_profile) {
    md += `\n#### Applicant profile\n\n${jsonBlock(settings.applicant_profile)}`;
  }
  md +=
    `\nChange any of these with **update_user_settings** - pass only the setting the user asked to change. ` +
    `For a profile, send only the keys that change, nested the way they are shown here.\n`;
  return toMcpResponse(md);
}

/**
 * Normalize a settings change.
 *
 * @param {string[]} applied - One line per key that was actually written.
 * @param {string} tool
 * @returns {{ content: Array }}
 */
export function normalizeSettingsChanged(applied, tool) {
  let md = `**Tool:** ${tool} | **Status:** OK\n\n`;
  md += applied.map((line) => `- ${line}`).join('\n');
  if (applied.some((line) => line.startsWith('home addresses'))) {
    md += `\nDistances are being recomputed and travel times re-measured in the background - the numbers on old listings catch up over the next hours.\n`;
  }
  return toMcpResponse(md);
}
