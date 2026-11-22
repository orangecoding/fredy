/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { providerConfig, mockFredy } from '../utils.js';
import { expect } from 'vitest';
import * as provider from '../../lib/provider/einsAImmobilien.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

describe('#einsAImmobilien testsuite()', () => {
  runConfig = provider.createConfig(providerConfig.einsAImmobilien, []);
  it('should test einsAImmobilien provider', async () => {
    const Fredy = await mockFredy();
    const mockedJob = {
      id: 'einsAImmobilien',
      notificationAdapter: null,
      spatialFilter: null,
      specFilter: null,
    };
    const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);
    const listings = await fredy.execute();
    if (listings == null || listings.length === 0) {
      throw new Error('Listings is empty!');
    }
    expect(listings).toBeInstanceOf(Array);
    const notificationObj = get();
    expect(notificationObj).toBeTypeOf('object');
    expect(notificationObj.serviceName).toBe('einsAImmobilien');
    notificationObj.payload.forEach((notify) => {
      /** check the actual structure **/
      expect(notify.id).toBeTypeOf('string');
      // An advert marketed as "Kaufpreis auf Anfrage" shows no figure on the card (its JSON-LD offer
      // says 0), so there is no price to report; when there is one it must be a formatted "… €".
      if (notify.price != null) {
        expect(notify.price).toBeTypeOf('string');
        expect(notify.price).toContain('€');
      }
      expect(notify.size).toBeTypeOf('string');
      expect(notify.size).toContain('m²');
      expect(notify.title).toBeTypeOf('string');
      expect(notify.link).toBeTypeOf('string');
      expect(notify.address).toBeTypeOf('string');
      /** check the values if possible **/
      expect(notify.title).not.toBe('');
      expect(notify.link).toContain('https://www.1a-immobilienmarkt.de');
    });
    // a page of price-less cards is the price selector breaking, not every seller withholding the
    // price at once
    expect(notificationObj.payload.some((notify) => notify.price != null)).toBe(true);
  });

  it('reads a price on request as no price rather than as a number', () => {
    // The text the price selector yields for such a card, non-breaking space included.
    const listing = provider.config.normalize({
      id: 27717221,
      price: 'Kaufpreis auf Anfrage',
      size: '165,00 m² Wohnfläche',
      rooms: '5 Zimmer',
      title: 'Moderne und großzügige 5 Zimmer-Wohnung',
      address: '40549 Düsseldorf',
      image: '/daten/185929/72/21/185929_27717221_28375_table.jpg',
    });
    expect(listing.price).toBeNull();
    expect(listing.size).toBe(165);
    expect(listing.rooms).toBe(5);
    expect(listing.link).toBe('https://www.1a-immobilienmarkt.de/expose/27717221.html');
  });
});
