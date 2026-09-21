/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { formatEuroPrice } from '../../services/price/priceService.js';
import { formatDecimal } from '../../services/number/numberService.js';
import { formatPricePerSqm, readMarketBenchmark } from '../../services/listings/marketBenchmark.js';
import * as timeService from '../../services/time/timeService.js';

/**
 * The two readings of a listing, kept apart.
 *
 * The detail page used to run one `Descriptions` list over everything it knew, which gave the
 * living space and the name of the search job that found the flat the same row height, the same
 * icon and the same weight. They are not the same kind of fact: one is a property of the flat and
 * belongs next to the price, the other is a property of Fredy's own bookkeeping and belongs in a
 * footnote. Splitting them here rather than in the component is what makes both testable without a
 * DOM - these functions return descriptors, never elements.
 */

/**
 * A single label/value pair as a section renders it.
 *
 * `value` is `null` when the listing does not carry the field; the caller decides whether that
 * means "N/A" or "leave the row out", which differs per section.
 *
 * @typedef {Object} ListingFact
 * @property {string} id - Stable key, also the React key.
 * @property {string} label - Already translated.
 * @property {string|null} value - Already formatted, or null when unknown.
 * @property {string} [helpText] - The sentence behind the help icon.
 * @property {string} [href] - Makes the value a link.
 * @property {boolean} [chip] - Render the value as a chip rather than as text.
 */

/**
 * Everything the reader needs from the context to format a fact.
 *
 * `describeBenchmark` is injected rather than imported because the only implementation lives in a
 * component module that pulls in React and a stylesheet, and this file has to stay importable from
 * a plain Node test.
 *
 * @typedef {Object} FactContext
 * @property {(key: string, params?: Object) => string} t
 * @property {string} locale
 * @property {Object} [financeThresholds] - As `useFinanceProfile` returns them.
 * @property {(benchmark: Object, t: Function, locale: string) => string} [describeBenchmark]
 * @property {(value: number, locale: string) => string} [formatEuro] - For the affordability limit.
 */

/**
 * What the flat itself is: price, what a square metre costs, how big it is, how many rooms.
 *
 * The price is lifted out of the list instead of being its first row, because it is the one figure
 * every other one on the page is read against.
 *
 * @param {Object|null} listing - A row as the listings API returns it.
 * @param {FactContext} ctx
 * @returns {{price: {text: string, reference: string|null, helpText: string}, benchmark: Object|null, tiles: ListingFact[], affordability: {verdict: string, label: string, helpText: string}|null}}
 */
export function buildObjectFacts(listing, ctx) {
  const { t, locale } = ctx;
  const row = listing ?? {};
  const na = t('common.na');
  const benchmark = readMarketBenchmark(row);
  const isRental = row.dealType === 'rent';

  const price = {
    text: row.price != null ? formatEuroPrice(row.price, locale) : na,
    // Split so the page can set the digits large and leave the currency symbol at reading size.
    // A 40px euro sign is louder than the sum it belongs to, and every listing has the same one.
    ...splitPrice(row.price, locale, na),
    // Names what the number is, which the number alone cannot: the same "1.200 EUR" is a monthly
    // rent on one listing and a purchase price on the next.
    reference: row.price != null ? t(isRental ? 'listing.detail.rentPerMonth' : 'listing.detail.purchasePrice') : null,
    helpText: t('listing.detail.fieldPriceHelp'),
  };

  const tiles = [
    {
      id: 'size',
      label: t('listing.detail.fieldSize'),
      value: row.size ? `${formatDecimal(row.size, locale)} m²` : null,
      helpText: t('listing.detail.fieldSizeHelp'),
    },
    {
      id: 'rooms',
      label: t('listing.detail.fieldRooms'),
      value: row.rooms ? formatDecimal(row.rooms, locale) : null,
      helpText: t('listing.detail.fieldRoomsHelp'),
    },
    {
      id: 'pricePerSqm',
      label: t('listing.detail.fieldPricePerSqm'),
      // Without the unit: the tile's own label already says "per m²", and repeating it there is
      // what pushed the figure past the width of a third of the rail.
      value: benchmark != null ? formatPricePerSqm(benchmark.pricePerSqm, locale, false) : null,
      // Two different explanations. With a benchmark the interesting part is the comparison and
      // where it came from; without one it is why no comparison is shown, which is a question the
      // page would otherwise leave the reader to guess at.
      helpText:
        benchmark != null && benchmark.verdict != null && ctx.describeBenchmark != null
          ? ctx.describeBenchmark(benchmark, t, locale)
          : t('listing.detail.fieldPricePerSqmHelp'),
    },
  ];

  return { price, benchmark, tiles, affordability: buildAffordability(row, ctx, isRental) };
}

/**
 * A price in two pieces: the digits, and the currency symbol beside them.
 *
 * Taken from `Intl.NumberFormat.formatToParts` rather than by slicing the formatted string,
 * because where the symbol goes and what separates it from the digits is the locale's business -
 * German puts it after with a space, English puts it in front with none.
 *
 * @param {number|null|undefined} value
 * @param {string} locale
 * @param {string} fallback - Shown when there is no price at all.
 * @returns {{amount: string, currency: string|null}}
 */
function splitPrice(value, locale, fallback) {
  if (value == null) return { amount: fallback, currency: null };

  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).formatToParts(value);

    return {
      amount: parts
        .filter((part) => part.type !== 'currency' && part.type !== 'literal')
        .map((part) => part.value)
        .join(''),
      currency: parts.find((part) => part.type === 'currency')?.value ?? null,
    };
  } catch {
    // An unknown locale is not worth an empty price; the joined form is still readable.
    return { amount: formatEuroPrice(value, locale), currency: null };
  }
}

/**
 * The verdict the server already decided, phrased for the chip next to the price.
 *
 * Returns null rather than an empty chip when the profile has no matching half, because a missing
 * verdict is the absence of an opinion and not a neutral one.
 *
 * @param {Object} row
 * @param {FactContext} ctx
 * @param {boolean} isRental
 * @returns {{verdict: string, label: string, helpText: string}|null}
 */
function buildAffordability(row, ctx, isRental) {
  const verdict = row.affordabilityVerdict ?? null;
  if (!verdict) return null;

  const { t, locale } = ctx;
  const thresholds = ctx.financeThresholds;
  const limit = isRental ? thresholds?.rent?.affordableMaxRent : thresholds?.buy?.affordableMaxPrice;

  return {
    verdict,
    label: t(`finance.verdict.${verdict}`),
    helpText: t(`listings.${isRental ? 'rentAffordabilityTooltip' : 'affordabilityTooltip'}.${verdict}`, {
      price: limit != null && ctx.formatEuro != null ? ctx.formatEuro(limit, locale) : '',
    }),
  };
}

/**
 * Where this row came from: which portal, which of the user's searches found it, and when.
 *
 * None of it describes the flat, which is why it sits in its own quiet list instead of among the
 * figures. Fields no portal filled in are dropped rather than shown as another "N/A" - a column of
 * them reads as a fault in Fredy rather than as a silent portal.
 *
 * @param {Object|null} listing
 * @param {FactContext} ctx
 * @returns {ListingFact[]}
 */
export function buildOriginFacts(listing, ctx) {
  const { t, locale } = ctx;
  const row = listing ?? {};
  const facts = [];

  if (row.provider) {
    facts.push({
      id: 'provider',
      label: t('listing.detail.fieldPortal'),
      value: providerName(row.provider),
      href: row.link || undefined,
      helpText: t('listing.detail.fieldProviderHelp'),
    });
  }

  if (row.job_name) {
    facts.push({
      id: 'job',
      label: t('listing.detail.fieldJob'),
      value: row.job_name,
      chip: true,
      helpText: t('listing.detail.fieldJobHelp'),
    });
  }

  if (row.created_at) {
    facts.push({
      id: 'created',
      label: t('listing.detail.fieldAdded'),
      value: timeService.format(row.created_at, true, locale),
      helpText: t('listing.detail.fieldAddedHelp'),
    });
  }

  // The date the portal itself states, when it states one at all, which is what tells this row
  // apart from "Added" above it.
  if (row.published_at) {
    facts.push({
      id: 'published',
      label: t('listing.detail.fieldPublished'),
      value: timeService.format(row.published_at, true, locale),
      helpText: t('listing.detail.fieldPublishedHelp'),
    });
  }

  // Only the detail page states these, and only for a part of the listings. They live here rather
  // than among the three tiles because a tile row that is sometimes four wide and sometimes three
  // is worse than a list that is sometimes a line longer.
  if (row.build_year) {
    facts.push({
      id: 'buildYear',
      label: t('listing.detail.fieldBuildYear'),
      value: String(row.build_year),
      helpText: t('listing.detail.fieldBuildYearHelp'),
    });
  }

  if (row.energy_class) {
    facts.push({
      id: 'energyClass',
      label: t('listing.detail.fieldEnergyClass'),
      value: String(row.energy_class),
      helpText: t('listing.detail.fieldEnergyClassHelp'),
    });
  }

  return facts;
}

/**
 * The portal's name as a person writes it, from the lowercase id the scraper stores.
 *
 * @param {string} provider
 * @returns {string}
 */
export function providerName(provider) {
  if (!provider) return '';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}
