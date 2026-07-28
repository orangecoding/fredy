/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'fs/promises';
import { getProviders } from '../../lib/utils.js';
import { parse } from '../../lib/services/extractor/parser/parser.js';

const testProviderConfig = JSON.parse(await readFile(new URL('./testProvider.json', import.meta.url), 'utf-8'));

/**
 * A search URL a given provider will accept. Several providers rewrite or validate the pasted URL
 * (immoscout expects a `/Suche/...` path, deutscheWohnen translates it into an API call), so the
 * real fixtures are used rather than a made-up example.com URL. `marker` is appended as a harmless
 * query parameter so two distinct URLs can be told apart after the provider rewrote them.
 *
 * @param {{metaInformation: {id: string}}} provider
 * @param {string} marker
 * @returns {string}
 */
function searchUrlFor(provider, marker) {
  const id = provider.metaInformation.id;
  const base = testProviderConfig[id]?.url;
  if (base == null) {
    throw new Error(`test/provider/testProvider.json has no url for provider "${id}"`);
  }
  const url = new URL(base);
  url.searchParams.set('fredyStatelessMarker', marker);
  return url.toString();
}

/**
 * Two jobs can be in flight at the same time - the scheduler works through its list while a user
 * presses "run" on another job. The provider modules used to hold the search URL and the blacklist
 * in module scope, so the second job overwrote the first one's settings mid-run and its listings
 * were fetched for one job and stored under another. These tests pin the property that makes that
 * impossible: a provider hands out a fresh, independent configuration per call.
 */
describe('providers are stateless', () => {
  /** @type {any[]} */
  let providers;

  beforeAll(async () => {
    providers = await getProviders();
  });

  it('loads every provider module', () => {
    expect(providers.length).toBeGreaterThan(0);
  });

  it('exposes createConfig and no longer exposes the mutating init', () => {
    for (const provider of providers) {
      const id = provider.metaInformation.id;
      expect(typeof provider.createConfig, `${id}.createConfig`).toBe('function');
      expect(provider.init, `${id}.init should be gone`).toBeUndefined();
    }
  });

  it('gives each call its own config object', () => {
    for (const provider of providers) {
      const id = provider.metaInformation.id;
      const first = provider.createConfig({ url: searchUrlFor(provider, 'first'), enabled: true }, []);
      const second = provider.createConfig({ url: searchUrlFor(provider, 'second'), enabled: true }, []);
      expect(first, `${id}`).not.toBe(second);
    }
  });

  it('does not let a second config change the first one’s url', () => {
    for (const provider of providers) {
      const id = provider.metaInformation.id;
      const first = provider.createConfig({ url: searchUrlFor(provider, 'first'), enabled: true }, []);
      const urlAfterFirst = first.url;
      provider.createConfig({ url: searchUrlFor(provider, 'second'), enabled: true }, []);
      expect(first.url, `${id} url was overwritten by a later run`).toBe(urlAfterFirst);
    }
  });

  it('binds the blacklist to the config that was created with it', () => {
    // Carries every field any provider's filter looks at (wgGesucht rejects a listing without an
    // id, kleinanzeigen and schwarzesbrett also weigh the address), so the only thing that can
    // make a filter say no here is the blacklist term.
    const listing = {
      id: 'listing-1',
      title: 'Nice flat, no pets',
      description: 'Charming Tauschwohnung near the park',
      address: 'Hauptstrasse 1, 40213 Düsseldorf',
      link: 'https://example.com/listing-1',
    };

    for (const provider of providers) {
      const id = provider.metaInformation.id;
      const filtering = provider.createConfig({ url: searchUrlFor(provider, 'a'), enabled: true }, ['Tauschwohnung']);
      const permissive = provider.createConfig({ url: searchUrlFor(provider, 'b'), enabled: true }, []);

      expect(filtering.filter(listing), `${id} should filter its own blacklist term`).toBe(false);
      // The decisive one: creating the permissive config must not have cleared the first config's
      // blacklist, which is exactly what the shared module-level array used to do.
      expect(permissive.filter(listing), `${id} should not filter without a blacklist`).toBe(true);
      expect(filtering.filter(listing), `${id} blacklist was clobbered by a later createConfig`).toBe(false);
    }
  });

  it('keeps the static template free of run-specific state', () => {
    for (const provider of providers) {
      const id = provider.metaInformation.id;
      if (provider.config == null) continue;
      provider.createConfig({ url: searchUrlFor(provider, 'run'), enabled: true }, ['Tauschwohnung']);
      expect(provider.config.url, `${id} template url was mutated`).toBeNull();
      expect(provider.config.filter, `${id} template should carry no bound filter`).toBeUndefined();
    }
  });
});

describe('parser holds no document state', () => {
  const crawlContainer = '.listing';
  const crawlFields = { id: '.id', title: '.title' };
  const pageFor = (label) =>
    `<html><body><div class="listing"><span class="id">${label}</span><span class="title">${label}</span></div></body></html>`;

  it('parses the html it is handed, not the last one loaded', () => {
    const first = parse(crawlContainer, crawlFields, pageFor('alpha'), 'https://example.com/a');
    const second = parse(crawlContainer, crawlFields, pageFor('beta'), 'https://example.com/b');

    expect(first[0].id).toBe('alpha');
    expect(second[0].id).toBe('beta');
  });

  it('keeps earlier results intact after a later parse', () => {
    const first = parse(crawlContainer, crawlFields, pageFor('alpha'), 'https://example.com/a');
    parse(crawlContainer, crawlFields, pageFor('beta'), 'https://example.com/b');
    // With the old module-level `$`, an interleaved parse replaced the document the first caller
    // was about to read.
    expect(first[0].title).toBe('alpha');
  });

  it('no longer exports loadParser', async () => {
    const parserModule = await import('../../lib/services/extractor/parser/parser.js');
    expect(parserModule.loadParser).toBeUndefined();
  });
});
