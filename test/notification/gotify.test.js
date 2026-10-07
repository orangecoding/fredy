/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external deps BEFORE importing the module under test.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, name: `Job ${jobKey}` }),
}));
vi.mock('../../lib/services/markdown.js', () => ({
  readAdapterReadme: () => '',
}));

function ok(body = { id: 1 }) {
  return { ok: true, status: 200, json: async () => body };
}

let mockNodeFetch;
let gotify;

const listing = {
  id: '42',
  title: 'Flat',
  link: 'https://example.com/a',
  address: 'Berlin',
  price: '800 €',
  size: '50 m²',
  image: 'https://img.example.com/photo.jpg',
};

const priceChange = {
  id: '42',
  title: 'Flat',
  link: 'https://example.com/a',
  address: 'Berlin',
  changeHeadline: 'Price dropped',
  oldPrice: '900 €',
  newPrice: '800 €',
  changePercent: '-11%',
  direction: 'down',
};

function configWith(fields) {
  return [{ id: 'gotify', fields: { server: 'https://gotify.example.com', token: 'AppToken', ...fields } }];
}

/** @returns {{url: string, opts: Object, payload: Object}} the n-th request the adapter made */
function request(n = 0) {
  const [url, opts] = mockNodeFetch.mock.calls[n];
  return { url, opts, payload: JSON.parse(opts.body) };
}

beforeEach(async () => {
  vi.resetModules();
  const nodeFetchMod = await import('node-fetch');
  mockNodeFetch = nodeFetchMod.default;
  mockNodeFetch.mockReset();
  mockNodeFetch.mockResolvedValue(ok());

  gotify = await import('../../lib/notification/adapter/gotify.js');
});

describe('gotify buildMessageUrl()', () => {
  it('appends /message to the server URL', () => {
    expect(gotify.buildMessageUrl('https://gotify.example.com')).toBe('https://gotify.example.com/message');
  });

  it('drops trailing slashes and surrounding whitespace', () => {
    expect(gotify.buildMessageUrl('  https://gotify.example.com//  ')).toBe('https://gotify.example.com/message');
  });

  it('keeps a sub path, for servers behind a reverse proxy', () => {
    expect(gotify.buildMessageUrl('https://example.com/gotify/')).toBe('https://example.com/gotify/message');
  });
});

describe('gotify resolvePriority()', () => {
  it('falls back to the default when empty, so the message is not muted', () => {
    expect(gotify.resolvePriority(undefined)).toBe(gotify.DEFAULT_PRIORITY);
    expect(gotify.resolvePriority(null)).toBe(gotify.DEFAULT_PRIORITY);
    expect(gotify.resolvePriority('')).toBe(gotify.DEFAULT_PRIORITY);
    expect(gotify.resolvePriority('  ')).toBe(gotify.DEFAULT_PRIORITY);
  });

  it('accepts numbers and numeric strings', () => {
    expect(gotify.resolvePriority(8)).toBe(8);
    expect(gotify.resolvePriority('2')).toBe(2);
    expect(gotify.resolvePriority(0)).toBe(0);
    expect(gotify.resolvePriority('0')).toBe(0);
  });

  it('rounds to an integer, which is what Gotify expects', () => {
    expect(gotify.resolvePriority('7.6')).toBe(8);
  });

  it('falls back to the default for garbage', () => {
    expect(gotify.resolvePriority('loud')).toBe(gotify.DEFAULT_PRIORITY);
  });
});

describe('gotify escapeMarkdown()', () => {
  it('escapes characters that would become markup', () => {
    expect(gotify.escapeMarkdown('*Top* [Lage] _neu_ #1')).toBe('\\*Top\\* \\[Lage\\] \\_neu\\_ \\#1');
  });

  it('leaves ordinary text alone', () => {
    expect(gotify.escapeMarkdown('3-Zimmer-Wohnung, 1.000 €')).toBe('3-Zimmer-Wohnung, 1.000 €');
  });

  it('copes with missing values', () => {
    expect(gotify.escapeMarkdown(undefined)).toBe('');
  });
});

describe('gotify buildListingMessage()', () => {
  it('renders the details, the links and the image', () => {
    const message = gotify.buildListingMessage({ ...listing, commute: '25 min' }, 'https://fredy.local');

    expect(message).toBe(
      [
        '**Address:** Berlin  \n**Size:** 50 m²  \n**Price:** 800 €  \n**Commute:** 25 min',
        '[Open listing](<https://example.com/a>) · [Open in Fredy](<https://fredy.local/#/listings/listing/42>)',
        '![](<https://img.example.com/photo.jpg>)',
      ].join('\n\n'),
    );
  });

  it('leaves out what is missing instead of rendering empty links', () => {
    const message = gotify.buildListingMessage({ title: 'Flat' });

    expect(message).toBe('**Address:** N/A  \n**Size:** N/A  \n**Price:** N/A');
  });
});

describe('gotify send()', () => {
  it('posts to the message endpoint with the app token in a header, not the URL', async () => {
    await gotify.send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: configWith({}),
      jobKey: 'berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(1);
    const { url, opts } = request();
    expect(url).toBe('https://gotify.example.com/message');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-Gotify-Key']).toBe('AppToken');
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('sends title, markdown message, priority and Android extras', async () => {
    await gotify.send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: configWith({ priority: '8' }),
      jobKey: 'berlin',
      baseUrl: 'https://fredy.local',
    });

    const { payload } = request();
    expect(payload.title).toBe('Job berlin at immoscout: Flat');
    expect(payload.priority).toBe(8);
    expect(payload.message).toContain('[Open in Fredy](<https://fredy.local/#/listings/listing/42>)');
    expect(payload.extras).toEqual({
      'client::display': { contentType: 'text/markdown' },
      'client::notification': {
        click: { url: 'https://example.com/a' },
        bigImageUrl: 'https://img.example.com/photo.jpg',
      },
    });
  });

  it('uses the default priority when none is configured', async () => {
    await gotify.send({
      serviceName: 'immoscout',
      newListings: [listing],
      notificationConfig: configWith({ priority: '' }),
      jobKey: 'berlin',
    });

    expect(request().payload.priority).toBe(gotify.DEFAULT_PRIORITY);
  });

  it('skips the big image when the listing has none', async () => {
    await gotify.send({
      serviceName: 'immoscout',
      newListings: [{ ...listing, image: null }],
      notificationConfig: configWith({}),
      jobKey: 'berlin',
    });

    expect(request().payload.extras['client::notification']).toEqual({ click: { url: 'https://example.com/a' } });
  });

  it('sends one message per listing', async () => {
    await gotify.send({
      serviceName: 'immoscout',
      newListings: [listing, { ...listing, id: '43', title: 'Other' }],
      notificationConfig: configWith({}),
      jobKey: 'berlin',
    });

    expect(mockNodeFetch).toHaveBeenCalledTimes(2);
    expect(request(1).payload.title).toBe('Job berlin at immoscout: Other');
  });

  it("rejects with Gotify's own error description", async () => {
    mockNodeFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized', errorCode: 401, errorDescription: 'invalid token' }),
    });

    await expect(
      gotify.send({
        serviceName: 'immoscout',
        newListings: [listing],
        notificationConfig: configWith({}),
        jobKey: 'b',
      }),
    ).rejects.toThrow('Gotify message could not be sent. Status code: 401 (invalid token)');
  });

  it('still rejects with the status code when the error body is not JSON', async () => {
    mockNodeFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });

    await expect(
      gotify.send({
        serviceName: 'immoscout',
        newListings: [listing],
        notificationConfig: configWith({}),
        jobKey: 'b',
      }),
    ).rejects.toThrow('Gotify message could not be sent. Status code: 502');
  });
});

describe('gotify sendPriceChange()', () => {
  it('sends the shared price change text as plain text', async () => {
    await gotify.sendPriceChange({
      serviceName: 'immoscout',
      priceChanges: [priceChange],
      notificationConfig: configWith({ priority: 3 }),
      jobKey: 'berlin',
      baseUrl: 'https://fredy.local',
    });

    const { url, opts, payload } = request();
    expect(url).toBe('https://gotify.example.com/message');
    expect(opts.headers['X-Gotify-Key']).toBe('AppToken');
    expect(payload.title).toBe('Job berlin at immoscout: Price dropped: 900 € -> 800 € (-11%)');
    expect(payload.message).toContain('Open in Fredy: https://fredy.local/#/listings/listing/42');
    expect(payload.priority).toBe(3);
    expect(payload.extras).toEqual({
      'client::display': { contentType: 'text/plain' },
      'client::notification': { click: { url: 'https://example.com/a' } },
    });
  });
});
