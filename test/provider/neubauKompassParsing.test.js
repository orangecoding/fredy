/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from '../../lib/services/extractor/parser/parser.js';
import { config } from '../../lib/provider/neubauKompass.js';

const URL = 'https://www.neubaukompass.de/neubau-immobilien/duesseldorf-region/eigentumswohnung/';

/** @param {string} html @returns {object[]} the raw cards, as the pipeline hands them to normalize() */
const readCards = (html) => parse(config.crawlContainer, config.crawlFields, html, URL) ?? [];

describe('#neubauKompass search page', () => {
  it('reads every project card of the recorded search, facts from their own rows', async () => {
    const cards = readCards(
      await readFile(new globalThis.URL('../testFixtures/neubauKompass.html', import.meta.url), 'utf8'),
    );

    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      // the label decides which value is which: price in euro, living space in m², rooms a bare number
      expect(card.price).toMatch(/€$/);
      expect(card.size).toMatch(/m²$/);
      expect(card.rooms).toMatch(/^[\d,\s-]+$/);

      const listing = config.normalize(card);
      expect(listing.link).toMatch(/^https:\/\/www\.neubaukompass\.de\/neubau\/.+\.html$/);
      expect(listing.title).not.toBe('');
      expect(listing.address).not.toBe('');
      expect(listing.image).toMatch(/^https:\/\//);
      expect(listing.price).toBeTypeOf('number');
      expect(listing.size).toBeTypeOf('number');
      expect(listing.rooms).toBeTypeOf('number');
    }
  });

  it('does not move the living space into the price when a card has no price row', () => {
    const [card] = readCards(`
      <div class="col-12 mb-4 position-relative">
        <div class="card nbk-project-card" id="1">
          <a href="/neubau/beispiel-duesseldorf/1.html" class="nbk-project-card-link" title="Beispiel - Düsseldorf"></a>
          <div class="nbk-project-card__media"><img src="https://pictures.example/1.jpg" class="card-img"></div>
          <p class="card-text nbk-project-card__description">Neubau von 8 Wohneinheiten <br> Beispielweg 1, 40210 Düsseldorf</p>
          <dl>
            <div><dt>Wohnfläche</dt><dd>70 - 95 m²</dd></div>
            <div><dt>Zimmer</dt><dd>3</dd></div>
            <div><dt>Bezugsfertig</dt><dd>Sommer 2027</dd></div>
          </dl>
        </div>
      </div>`);

    expect(config.normalize(card)).toMatchObject({
      link: 'https://www.neubaukompass.de/neubau/beispiel-duesseldorf/1.html',
      price: null,
      size: 70,
      rooms: 3,
      image: 'https://pictures.example/1.jpg',
    });
  });
});
