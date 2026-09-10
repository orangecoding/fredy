/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What the first segment of a search url means to the search endpoint.
 *
 * `/vendita-case/roma/` says both what is on offer and on what terms, and the endpoint wants those
 * as numbers: a contract, a category, and for the narrower searches a property type as well.
 *
 * The numbers come from the website's own search form, which carries the whole vocabulary in one of
 * its javascript bundles, and every entry was then confirmed against the endpoint - it answers each
 * search with the words it ran it under, and `seoData.subtitle` reads "uffici in vendita Roma".
 *
 * Both halves are needed. A category that reads as the obvious one is not: offices are 23, while 2
 * is the whole commercial vertical, and asking with 2 answers with houses under an office url.
 *
 * A segment missing from this table is not translated. That search is read off the website the old
 * way, which costs a browser and a bot wall but returns what the user asked for.
 *
 * See `reverse-engineered-immobiliare.md` for the vocabulary and for how to confirm a new entry.
 */

/** The terms of the offer, from the first word of the segment. */
const CONTRACTS = { vendita: '1', affitto: '2' };

/**
 * What is on offer, from the rest of the segment. `case` is every kind of home, so it names no
 * type; the narrower ones name one.
 */
const OFFERS = {
  // Homes, whole and by kind.
  case: { idCategoria: '1' },
  appartamenti: { idCategoria: '1', 'idTipologia[]': '4' },
  attici: { idCategoria: '1', 'idTipologia[]': '5' },
  'case-indipendenti': { idCategoria: '1', 'idTipologia[]': '7' },
  ville: { idCategoria: '1', 'idTipologia[]': '12' },
  villette: { idCategoria: '1', 'idTipologia[]': '13' },
  // Everything else is a category of its own rather than a kind of home.
  stanze: { idCategoria: '4' },
  palazzi: { idCategoria: '20' },
  magazzini: { idCategoria: '21' },
  garage: { idCategoria: '22' },
  uffici: { idCategoria: '23' },
  terreni: { idCategoria: '24' },
  capannoni: { idCategoria: '25' },
  negozi: { idCategoria: '26' },
};

/**
 * Read the category segment of a search url.
 *
 * @param {string} segment For example `vendita-case`.
 * @returns {Record<string, string>|null} the criteria it stands for, or null for a search the
 *   endpoint cannot be asked for in these terms
 */
export function readCategory(segment) {
  const separator = String(segment).indexOf('-');
  if (separator < 0) return null;

  const idContratto = CONTRACTS[segment.slice(0, separator)];
  const offer = OFFERS[segment.slice(separator + 1)];
  return idContratto == null || offer == null ? null : { idContratto, ...offer };
}
