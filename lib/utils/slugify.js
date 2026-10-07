/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The url spelling of a name: unaccented, lowercase, everything else turned into a single dash.
 *
 * Portals spell a place one way in their catalogues ("Reggio nell'Emilia", "Forlì-Cesena") and
 * another in the urls they hand out ("reggio-nell-emilia", "forli-cesena"), and a lookup by url has
 * to bring the two together. Accents are decomposed and their marks dropped rather than mapped one
 * by one, so a name in any language reduces the same way; every run of characters that is neither a
 * letter nor a digit collapses into one dash, and leading and trailing dashes go.
 *
 * The ligatures are the exception that has to be spelled out: NFD leaves "œ" and "æ" whole, and
 * dropping them as "not a letter" turned Vandœuvre-lès-Nancy into `vand-uvre-les-nancy`, where
 * every portal writes `vandoeuvre-les-nancy`.
 *
 * @param {string|null|undefined} name The name as the portal writes it.
 * @returns {string} the same name as a url slug, empty when the name carries nothing sluggable.
 */
export function slugify(name) {
  return String(name ?? '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
