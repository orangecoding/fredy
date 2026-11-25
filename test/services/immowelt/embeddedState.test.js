/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import LZString from 'lz-string';
import { describe, expect, it } from 'vitest';
import { readEmbeddedState, readSearchResults } from '../../../lib/services/immowelt/embeddedState.js';
import { normalizeClassified } from '../../../lib/services/immowelt/classified.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../testFixtures');

/** The recorded result page: a München rental search, sorted by date, 30 cards. */
const RECORDED = fs.readFileSync(path.join(FIXTURES, 'immowelt_serp.html'), 'utf8');

/**
 * A result page carrying the given `pageProps`, packed the way immowelt packs them.
 *
 * @param {object} pageProps what the decompressed search state holds
 * @returns {string} the page source
 */
function resultPage(pageProps) {
  const state = { data: { 'classified-serp-init-data': LZString.compressToBase64(JSON.stringify({ pageProps })) } };
  return `<html><head><script id="__UFRN_FETCHER__">window["__UFRN_FETCHER__"]=JSON.parse(${JSON.stringify(
    JSON.stringify(state),
  )});</script></head><body></body></html>`;
}

describe('#immowelt result page reader', () => {
  it('reads every card of the recorded page, in the order the page shows them', () => {
    const classifieds = readSearchResults(RECORDED);

    expect(classifieds).toHaveLength(30);
    expect(new Set(classifieds.map((card) => card.id)).size).toBe(30);
    expect(classifieds[0].id).toBe('25MDNMV1LVKH');
  });

  // The cards are the /classifiedList payload with a few more fields, which is the whole reason the
  // page could replace the BFF without touching anything downstream.
  it('hands normalizeClassified cards it reads into complete listings', () => {
    for (const listing of readSearchResults(RECORDED).map(normalizeClassified)) {
      expect(listing.link).toMatch(/^https:\/\/www\.immowelt\.de\/expose\//);
      expect(listing.title).not.toBe('');
      expect(listing.price).toBeTypeOf('number');
      expect(listing.size).toBeTypeOf('number');
      expect(listing.rooms).toBeTypeOf('number');
      expect(listing.address).not.toBe('');
      expect(listing.image).toMatch(/^https:\/\//);
      expect(listing.publishedAt).toBeTypeOf('number');
    }
  });

  it('keeps the order the ids give, not the order the card data is stored in', () => {
    const html = resultPage({
      classifieds: ['b', 'a'],
      classifiedsData: { a: { id: 'a' }, b: { id: 'b' } },
    });

    expect(readSearchResults(html).map((card) => card.id)).toEqual(['b', 'a']);
  });

  it('skips an id the page carries no card for', () => {
    const html = resultPage({ classifieds: ['a', 'gone'], classifiedsData: { a: { id: 'a' } } });

    expect(readSearchResults(html)).toEqual([{ id: 'a' }]);
  });

  // An empty list is a search that found nothing; null is a page that could not be read. The caller
  // only asks the BFF for the second.
  it('answers a search without hits with an empty list', () => {
    expect(readSearchResults(resultPage({ classifieds: [], classifiedsData: {} }))).toEqual([]);
  });

  it('answers null for a search the platform says failed', () => {
    expect(readSearchResults(resultPage({ apiError: true, classifieds: [], classifiedsData: {} }))).toBeNull();
  });

  it("answers null for DataDome's device check, which carries no listings", () => {
    const deviceCheck =
      "<html lang=\"de\"><head><title>immowelt.de</title></head><body><script>var dd={'rt':'i'}</script>" +
      '<iframe src="https://geo.captcha-delivery.com/interstitial/" title="DataDome Device Check"></iframe></body></html>';

    expect(readSearchResults(deviceCheck)).toBeNull();
  });

  it('answers null for no page, and for a tag whose search state will not unpack', () => {
    expect(readSearchResults(null)).toBeNull();
    expect(readSearchResults('')).toBeNull();

    const garbled =
      '<script id="__UFRN_FETCHER__">window["__UFRN_FETCHER__"]=JSON.parse("{\\"data\\":{\\"classified-serp-init-data\\":\\"!!\\"}}");</script>';
    expect(readSearchResults(garbled)).toBeNull();
  });

  // The same scan reads the exposé's state; a description ending in a bracketed aside must not end it.
  it('reads a state whose text contains the characters that end a lazy match', () => {
    const state = { app_cldp: { data: { classified: { text: 'Ruhige Lage (siehe Plan");' } } } };
    const html = `<script id="__UFRN_LIFECYCLE_SERVERREQUEST__">window["__UFRN_LIFECYCLE_SERVERREQUEST__"]=JSON.parse(${JSON.stringify(
      JSON.stringify(state),
    )});</script>`;

    expect(readEmbeddedState(html, '__UFRN_LIFECYCLE_SERVERREQUEST__')).toEqual(state);
    expect(readEmbeddedState(html, '__UFRN_FETCHER__')).toBeNull();
  });
});
