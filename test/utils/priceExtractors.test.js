/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { readJsonLdPrice, readNextData, sanitize } from '../../lib/utils/priceExtractors.js';

/**
 * These helpers turn a portal's markup into the number that becomes a listing's price. The failure
 * mode that matters is not "no price found" - that is handled everywhere as "we do not know" - but
 * a *plausible wrong* number, which is written to the history of every listing of that provider
 * before anybody notices.
 */
describe('utils/priceExtractors', () => {
  const ldBlock = (body) =>
    `<html><head><script type="application/ld+json">${body}</script></head><body></body></html>`;

  describe('sanitize', () => {
    // Structured sources are English-decimal by spec. Running them through the German-format parser
    // turned kleinanzeigen's "1600.00" into 160000 - a hundredfold price, caught in review.
    it('reads machine format, where a dot is a decimal point', () => {
      expect(sanitize('1600.00')).toBe(1600);
      expect(sanitize(1070.0)).toBe(1070);
      expect(sanitize('526000')).toBe(526000);
    });

    it.each([null, undefined, '', 'auf Anfrage', 0, '0', -5])('rejects the unusable value %p', (raw) => {
      expect(sanitize(raw)).toBeNull();
    });
  });

  describe('readJsonLdPrice', () => {
    it('reads offers.price out of a well-formed block', () => {
      expect(readJsonLdPrice(ldBlock('{"@type":"Product","offers":{"@type":"Offer","price":"24900000"}}'))).toBe(
        24900000,
      );
    });

    it('finds the offer however deeply it is nested', () => {
      const body = '{"@graph":[{"@type":"BreadcrumbList"},{"mainEntity":{"offers":[{"price":526000}]}}]}';
      expect(readJsonLdPrice(ldBlock(body))).toBe(526000);
    });

    it('skips a block with no offer and keeps looking', () => {
      const html = ldBlock('{"@type":"Organization"}') + ldBlock('{"offers":{"price":"1070.00"}}');
      expect(readJsonLdPrice(html)).toBe(1070);
    });

    // immobilien.de emits raw newlines inside its description string, which is enough for
    // JSON.parse to reject an otherwise perfectly good block.
    it('falls back to a text scan when the block is not valid JSON', () => {
      const body = '{"@type":"RealEstateListing","description":"line one\nline two","offers":{"price" : 1070.00}}';
      expect(readJsonLdPrice(ldBlock(body))).toBe(1070);
    });

    // The whole point of the fallback guard. "1.600" is one thousand six hundred to a German portal
    // and one point six to a machine-format parser, and there is no way to tell from the text which
    // was meant. Refusing beats guessing: a null costs one observation, a wrong guess rewrites the
    // price history of every listing this provider has.
    it.each(['{"offers":{"price": 1.600,00}}', '{"offers":{"price":"1.600,00"}}', '{"offers":{"price":"1 600"}}'])(
      'refuses the ambiguously formatted %s rather than guessing',
      (body) => {
        const html = ldBlock(body.replace('{"offers"', '{"description":"broken\nblock","offers"'));
        expect(readJsonLdPrice(html)).toBeNull();
      },
    );

    it('returns null when there is no JSON-LD at all', () => {
      expect(readJsonLdPrice('<html><body>nothing</body></html>')).toBeNull();
      expect(readJsonLdPrice('')).toBeNull();
    });
  });

  describe('readNextData', () => {
    it('parses the embedded payload', () => {
      const html =
        '<html><body><script id="__NEXT_DATA__">{"props":{"pageProps":{"estate":{"priceNumeric":1618200}}}}</script></body></html>';
      expect(readNextData(html)?.props?.pageProps?.estate?.priceNumeric).toBe(1618200);
    });

    it('returns null rather than throwing when the tag is missing or unparseable', () => {
      expect(readNextData('<html><body></body></html>')).toBeNull();
      expect(readNextData('<html><script id="__NEXT_DATA__">{not json</script></html>')).toBeNull();
    });
  });
});
