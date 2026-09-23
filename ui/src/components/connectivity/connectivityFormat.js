/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How connectivity is worded and which of it is worth offering as a filter.
 *
 * Kept apart from the components because these are decisions rather than markup: which speed steps
 * a filter offers, which technologies are still worth naming, and how a source is credited.
 */

/**
 * The national registers Fredy can ask, in the order the settings page lists them.
 *
 * Mirrors `SOURCE_IDS` on the server. Kept here rather than in the settings hook so that anything
 * needing the list - the admin page, the locale parity test - can have it without dragging a UI
 * framework along.
 * @type {string[]}
 */
export const CONNECTIVITY_SOURCES = ['de-bba', 'ch-bakom', 'at-rtr', 'es-setid'];

/**
 * The downstream thresholds the overview filter offers, in Mbit/s.
 *
 * Every one of them exists in the class ladders of the two registers that publish classes at all
 * (Germany counts 10/16/30/50/100/200/400/1000, Switzerland 10/30/100/300/500/1000). A step in
 * between would still work as a `>=` comparison, but the chip would then claim a threshold neither
 * register can actually report on, which is a promise the number underneath does not keep. Austria
 * and Spain publish the real figure rather than a class, so they land on whichever side of a
 * threshold they belong on without any of this mattering to them.
 * @type {number[]}
 */
export const DOWNSTREAM_FILTER_STEPS = [30, 100, 1000];

/**
 * Mobile technologies worth filtering by.
 *
 * 2G is left out. It still covers almost everything and so filters nothing, and nobody chooses a
 * flat for its ability to make a phone call over GSM.
 * @type {string[]}
 */
export const FILTERABLE_TECHNOLOGIES = ['4g', '5g', '5g_sa'];

/**
 * Mobile operators worth filtering by. Germany only.
 *
 * Switzerland counts operators rather than naming them, so there is nothing there to filter on.
 * Austria and Spain do name theirs, but Fredy keeps only the count: the per-operator half of the
 * stored bitmask is laid out for these four codes, and widening it would change the meaning of
 * every mask already in the database.
 * @type {string[]}
 */
export const FILTERABLE_OPERATORS = ['dt', 'vf', 'tf', 'ee'];

/**
 * Mobile technologies the detail card names, best first.
 *
 * 2G is here but not in the filter list above: on a card about one address, "only 2G" is exactly
 * what somebody needs to see before they sign a lease, while as a filter it would match almost
 * every listing in the country and narrow nothing.
 * @type {string[]}
 */
export const DISPLAY_MOBILE_TECHNOLOGIES = ['5g_sa', '5g', '4g', '2g'];

/**
 * Fixed-line technologies shown on the detail card, in the order they are read.
 *
 * Fibre first because it is the one people are looking for, then cable, then copper from the
 * cabinet - fastest and most future-proof to least.
 * @type {string[]}
 */
export const DISPLAY_TECHNOLOGIES = ['ftthb', 'hfc', 'fttc'];

/**
 * Who to credit for an answer, and where to send somebody who wants to check it.
 *
 * Naming the source is a condition of using either register, so this is not decoration - it is
 * what makes the data usable at all.
 * @type {Record<string, {label: string, href: string, extraLabel: string, extraHref: string}>}
 */
export const SOURCE_ATTRIBUTION = {
  'de-bba': {
    label: 'Breitbandatlas | Gigabit-Grundbuch',
    href: 'https://gigabitgrundbuch.bund.de',
    extraLabel: '© BKG',
    extraHref: 'https://sg.geodatenzentrum.de/web_public/nutzungsbedingungen.pdf',
  },
  'ch-bakom': {
    label: '© BAKOM',
    href: 'https://www.bakom.admin.ch',
    extraLabel: '© swisstopo',
    extraHref: 'https://www.geo.admin.ch/de/about-swiss-geoportal/impressum.html',
  },
  'at-rtr': {
    label: 'Breitbandatlas Österreich',
    href: 'https://breitbandatlas.gv.at',
    extraLabel: '© RTR-GmbH, CC BY 3.0 AT',
    extraHref: 'https://creativecommons.org/licenses/by/3.0/at/deed.de',
  },
  'es-setid': {
    label: 'Mapas de cobertura de banda ancha',
    href: 'https://digital.gob.es/telecomunicaciones-infraestructuras-digitales/areas-interes/banda-ancha/informacion-cobertura',
    // The parcels the Spanish map is drawn on are the cadastre's, not the ministry's.
    extraLabel: '© Dirección General del Catastro',
    extraHref: 'https://www.sedecatastro.gob.es/',
  },
};

/**
 * The downstream figure as it is shown, e.g. `1000`.
 *
 * @param {number|null} mbit
 * @returns {string|null}
 */
export function formatDownstream(mbit) {
  return mbit == null ? null : String(mbit);
}

/**
 * Rounds a household share to something worth printing.
 *
 * The registers report two decimals, which reads as a precision the underlying survey does not
 * have. A whole percent is as fine as the number deserves.
 *
 * @param {number|null} share
 * @returns {number|null}
 */
export function roundShare(share) {
  return share == null ? null : Math.round(share);
}
