/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The provider registry and the browser, both replaced.
 *
 * `vi.mock` is hoisted above the imports, so the factories may not close over anything declared
 * below them - hence the mutable holder, which the tests fill in per case.
 */
const state = { providers: [], launched: 0, closed: 0 };

vi.mock('../../lib/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getProviders: () => Promise.resolve(state.providers) };
});

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({
  launchBrowser: async () => {
    state.launched++;
    return { fake: true };
  },
  closeBrowser: async () => {
    state.closed++;
  },
  default: async () => null,
}));

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ proxyUrl: null }),
  getUserSettings: () => ({}),
}));

const { refetchListingDetails, refetchListingDetailsOnce, rowToParsedListing } =
  await import('../../lib/services/listings/detailRefetchService.js');

/**
 * A provider module as the registry hands them over.
 *
 * @param {string} id
 * @param {Function|null} fetchDetails
 * @returns {Object}
 */
function providerModule(id, fetchDetails) {
  return {
    metaInformation: { id, name: id, baseUrl: `https://${id}.test` },
    config: fetchDetails == null ? {} : { fetchDetails },
  };
}

/** A stored row, snake_case, as `getListingById` returns one. */
const row = {
  id: 'row-1',
  hash: 'provider-hash-1',
  provider: 'testportal',
  link: 'https://testportal.test/ad/1',
  title: 'Helle 3-Zimmer-Wohnung',
  price: 990,
  size: 84,
  rooms: 3,
  address: 'Vennstraße 117, 40627 Düsseldorf',
  description: null,
  image_url: 'https://testportal.test/img/1.jpg',
  build_year: null,
  energy_class: null,
  published_at: null,
  address_is_manual: 0,
};

beforeEach(() => {
  state.providers = [];
  state.launched = 0;
  state.closed = 0;
});

describe('rowToParsedListing', () => {
  it('hands the provider the shape its own scraper produced, not the database row', () => {
    // Providers read these back as fallbacks - immobilienDe keeps `listing.buildYear` when the
    // exposé states none - so passing snake_case would turn every such fallback into a null.
    const parsed = rowToParsedListing({ ...row, build_year: 1978, energy_class: 'C' });

    expect(parsed.buildYear).toBe(1978);
    expect(parsed.energyClass).toBe('C');
    expect(parsed.image).toBe(row.image_url);
    expect(parsed).not.toHaveProperty('build_year');
    expect(parsed).not.toHaveProperty('image_url');
  });

  it('passes the provider hash as the id, which is the one their log lines mean', () => {
    expect(rowToParsedListing(row).id).toBe('provider-hash-1');
    // A row scraped before hashes were stored still has to identify itself somehow.
    expect(rowToParsedListing({ ...row, hash: undefined }).id).toBe('row-1');
  });
});

describe('refetchListingDetails', () => {
  it('says so plainly when the portal has no detail page to read', async () => {
    state.providers = [providerModule('testportal', null)];

    const result = await refetchListingDetails(row);

    expect(result.status).toBe('unsupported');
    expect(result.fields).toEqual({});
    // And it does not pay for a browser to find that out.
    expect(state.launched).toBe(0);
  });

  it('reports a provider it has never heard of as unsupported rather than crashing', async () => {
    state.providers = [providerModule('someotherportal', async (listing) => listing)];

    expect((await refetchListingDetails(row)).status).toBe('unsupported');
  });

  it('stores the description a detail page supplied', async () => {
    state.providers = [
      providerModule('testportal', async (listing) => ({ ...listing, description: 'Ein langer Exposétext.' })),
    ];

    const result = await refetchListingDetails(row);

    expect(result.status).toBe('updated');
    expect(result.fields).toEqual({ description: 'Ein langer Exposétext.' });
  });

  it('notices a change even from a provider that edits the listing in place', async () => {
    // immoscout mutates its argument and returns the same reference, so comparing objects - or
    // comparing against the one that was passed in - reports "unchanged" for every success.
    state.providers = [
      providerModule('testportal', async (listing) => {
        listing.description = 'In place geschrieben.';
        return listing;
      }),
    ];

    const result = await refetchListingDetails(row);

    expect(result.status).toBe('updated');
    expect(result.fields.description).toBe('In place geschrieben.');
  });

  it('answers unchanged when the page gave nothing back', async () => {
    state.providers = [providerModule('testportal', async (listing) => listing)];

    const result = await refetchListingDetails(row);

    expect(result.status).toBe('unchanged');
    expect(result.fields).toEqual({});
  });

  it('treats a blank or repeated value as nothing, not as a change', async () => {
    state.providers = [
      providerModule('testportal', async (listing) => ({
        ...listing,
        description: '   ',
        address: row.address,
      })),
    ];

    expect((await refetchListingDetails(row)).status).toBe('unchanged');
  });

  it('never nulls a column the detail page simply does not carry', async () => {
    const filled = { ...row, description: 'Was schon da war.', build_year: 1978 };
    state.providers = [
      providerModule('testportal', async () => ({ description: null, buildYear: null, energyClass: 'B' })),
    ];

    const result = await refetchListingDetails(filled);

    expect(result.fields).toEqual({ energy_class: 'B' });
    expect(result.fields).not.toHaveProperty('description');
    expect(result.fields).not.toHaveProperty('build_year');
  });

  it('reports a provider that throws as a failure rather than as an empty page', async () => {
    // Only immoscout reaches this today; everyone else catches inside and returns the listing.
    state.providers = [
      providerModule('testportal', async () => {
        throw new Error('502 from the portal');
      }),
    ];

    const result = await refetchListingDetails(row);

    expect(result.status).toBe('failed');
    expect(result.fields).toEqual({});
  });

  it('closes the browser it launched, including when the fetch throws', async () => {
    state.providers = [
      providerModule('testportal', async () => {
        throw new Error('boom');
      }),
    ];

    await refetchListingDetails(row);

    expect(state.launched).toBe(1);
    expect(state.closed).toBe(1);
  });

  it('leaves an address the user placed by hand alone', async () => {
    // The portal's string is what they were correcting. Writing it back would undo the correction
    // on the next press of the button.
    state.providers = [
      providerModule('testportal', async (listing) => ({
        ...listing,
        address: 'Falsche Straße 1, 40627 Düsseldorf',
        description: 'Text kam trotzdem an.',
      })),
    ];

    const result = await refetchListingDetails({ ...row, address_is_manual: 1 });

    expect(result.fields).not.toHaveProperty('address');
    expect(result.fields.description).toBe('Text kam trotzdem an.');
  });

  it('cleans a portal address the same way the bulk path does', async () => {
    // storeListings strips parenthesised segments, so a refetch that stored the raw string would
    // leave the one address in the table formatted unlike every other.
    state.providers = [
      providerModule('testportal', async (listing) => ({
        ...listing,
        address: 'Musterweg 4 (Hinterhaus), 40627 Düsseldorf',
      })),
    ];

    const result = await refetchListingDetails(row);

    expect(result.fields.address).toBe('Musterweg 4, 40627 Düsseldorf');
  });

  it('writes only the five fields a detail page is authoritative about', async () => {
    state.providers = [
      providerModule('testportal', async (listing) => ({
        ...listing,
        description: 'Text.',
        price: 1,
        title: 'Ein ganz anderer Titel',
        link: 'https://elsewhere.test',
      })),
    ];

    const result = await refetchListingDetails(row);

    expect(Object.keys(result.fields)).toEqual(['description']);
  });
});

describe('refetchListingDetailsOnce', () => {
  it('refuses a second fetch while the first is still running', async () => {
    let release;
    const started = new Promise((resolve) => (release = resolve));
    let pending;
    state.providers = [
      providerModule('testportal', async (listing) => {
        release();
        await pending;
        return { ...listing, description: 'Endlich da.' };
      }),
    ];
    pending = new Promise((resolve) => setTimeout(resolve, 5));

    const first = refetchListingDetailsOnce(row);
    await started;
    const second = await refetchListingDetailsOnce(row);

    expect(second.status).toBe('busy');
    expect((await first).status).toBe('updated');
  });

  it('lets the next attempt through once the first has finished, even a failed one', async () => {
    state.providers = [
      providerModule('testportal', async () => {
        throw new Error('boom');
      }),
    ];

    expect((await refetchListingDetailsOnce(row)).status).toBe('failed');
    expect((await refetchListingDetailsOnce(row)).status).toBe('failed');
  });

  it('does not let one listing block another', async () => {
    state.providers = [providerModule('testportal', async (listing) => ({ ...listing, description: 'Text.' }))];

    const [a, b] = await Promise.all([
      refetchListingDetailsOnce(row),
      refetchListingDetailsOnce({ ...row, id: 'row-2' }),
    ]);

    expect(a.status).toBe('updated');
    expect(b.status).toBe('updated');
  });
});
