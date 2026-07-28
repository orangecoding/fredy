/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Grunderwerbsteuer (real estate transfer tax) per Bundesland, in percent of the
 * purchase price.
 *
 * These are defaults, not law. Bundesländer change their rate from time to time
 * (Thüringen dropped to 5.0 in 2024, Hamburg rose to 5.5 in 2023), so the UI keeps
 * the value editable and only uses this table to prefill the field. A stale entry
 * therefore degrades to a wrong default, never to a wrong result the user cannot fix.
 *
 * @type {Record<string, number>}
 *
 * The constants below are duplicated from lib/services/finance/constants.js. The frontend must not
 * import out of lib/ - that code is server-side and free to grow a Node built-in at any time,
 * which would break the Vite build with an error pointing nowhere near the cause.
 *
 * Only constants live here. The arithmetic that uses them stays on the server and is reached over
 * the API (/api/finance/*), because two implementations of the same amortization scoring the same
 * listings is a contradiction waiting to ship. Keep the values in step with the backend copy;
 * test/ui/financeCopyInSync.test.js fails if they drift apart.
 */
export const GRUNDERWERBSTEUER = Object.freeze({
  BW: 5.0,
  BY: 3.5,
  BE: 6.0,
  BB: 6.5,
  HB: 5.0,
  HH: 5.5,
  HE: 6.0,
  MV: 6.0,
  NI: 5.0,
  NW: 6.5,
  RP: 5.0,
  SL: 6.5,
  SN: 5.5,
  ST: 5.0,
  SH: 6.5,
  TH: 5.0,
});

/**
 * Bundesland codes in the order they should appear in a dropdown, with their
 * German long names. Kept next to the tax table so the two can never drift apart.
 *
 * @type {ReadonlyArray<{code: string, name: string}>}
 */
export const BUNDESLAENDER = Object.freeze([
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
]);

/** Notar (~1.0 %) + Grundbucheintrag (~0.5 %), in percent of the purchase price. */
export const DEFAULT_NOTARY_PCT = 1.5;

/** Maklerprovision for the buyer, in percent. 3.57 % = 3 % + 19 % VAT. Zero on a private sale. */
export const DEFAULT_MAKLER_PCT = 3.57;

/** Default nominal annual interest rate (Sollzins) in percent. */
export const DEFAULT_RATE = 3.8;

/** Default initial amortization (anfängliche Tilgung) in percent per year. */
export const DEFAULT_TILGUNG = 2.0;

/** Default fixed-rate period (Zinsbindung) in years. */
export const DEFAULT_ZINSBINDUNG_YEARS = 10;

/**
 * Hard stop for the amortization loop, in months. A loan that has not been repaid
 * after 50 years is reported as `neverPaysOff` rather than simulated further.
 */
export const MAX_SIMULATION_MONTHS = 50 * 12;

/**
 * Listings priced below this are treated as rentals, not purchases.
 *
 * Jobs now carry a deal type, so this is no longer how rent and purchase are told apart. It
 * survives as the floor under the purchase verdicts: `price` is whatever the provider parsed,
 * and a buying job that scrapes up a 1.200 EUR figure must not have it scored as an absurdly
 * affordable house. It is also the last-resort classifier for a listing whose job predates the
 * deal type. User-editable, because what counts as "too cheap to be a purchase" varies.
 */
export const DEFAULT_PURCHASE_PRICE_THRESHOLD = 30000;

/**
 * The affordability rule of thumb: total housing + debt costs should stay at or below
 * 35 % of net income. Between the cap and the stretch bound a purchase is possible but
 * tight; above the stretch bound it is out of reach.
 *
 * Rentals are judged by the same rule. A mortgage instalment and a warm rent are the same
 * thing to a household budget - money that leaves every month - so measuring them differently
 * would only make the two halves of the finance page contradict each other.
 */
export const AFFORDABILITY_RULE = Object.freeze({ cap: 0.35, stretch: 0.4 });

/**
 * Nebenkosten (Betriebskosten, heating, ...) on top of the cold rent, in percent.
 *
 * Providers quote Kaltmiete, but a household pays warm. Without this surcharge every rental
 * would be judged roughly a fifth cheaper than it really is. Editable, because the spread
 * between cold and warm varies a lot by building and by city.
 */
export const DEFAULT_NEBENKOSTEN_PCT = 25;

/** Monthly buffer kept free of any debt service when recommending a rate. */
export const DEFAULT_SAFETY_BUFFER = 200;
