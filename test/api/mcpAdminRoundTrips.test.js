/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { migratedDatabase, sqliteConnectionFor } from '../mocks/migratedDatabase.js';

/*
 * The administration tools as a model actually uses them: read something, then change it based on
 * what the read showed. The tool-level tests mock storage, which is exactly where the trouble with
 * these round trips hid - a read that showed less than the write needed, a write that replaced what
 * it should have merged, a lookup that could not find what the previous answer pointed at. So these
 * run against the production schema, with real storage behind every tool. Only the token check, the
 * tracker, the global settings and the provider catalog are stand-ins; the adapter catalog is read
 * from disk.
 */

const root = path.resolve('.');

const ALICE = { id: 'alice', isAdmin: false };
const IMMOSCOUT = { id: 'immoscout', name: 'Immoscout', baseUrl: 'https://www.immobilienscout24.de/' };
const IMMOWELT = { id: 'immowelt', name: 'Immowelt', baseUrl: 'https://www.immowelt.de/' };
const KOELN_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/koeln/wohnung-mieten';
const BONN_URL = 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/bonn/wohnung-mieten';
const WELT_URL = 'https://www.immowelt.de/suche/koeln/wohnungen/mieten';

let db;
let caller;
let createMcpServer;
let jobStorage;
let channelStorage;
let settingsStorage;

/**
 * Call one tool the way a client does, over a linked transport.
 *
 * @param {string} name
 * @param {object} args
 * @returns {Promise<{content: Array<{text: string}>, isError?: boolean}>}
 */
async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

const textOf = (result) => result.content.map((part) => part.text).join('\n');

/**
 * Store a listing under a job, with only the columns these tests read.
 *
 * @param {{id: string, jobId: string, manuallyDeleted?: number}} listing
 */
function insertListing({ id, jobId, manuallyDeleted = 0 }) {
  db.prepare(
    `INSERT INTO listings (id, hash, job_id, provider, title, link, currency, is_active, manually_deleted)
     VALUES (?, ?, ?, 'immoscout', ?, ?, 'EUR', 1, ?)`,
  ).run(id, `hash-${id}`, jobId, `Flat ${id}`, `https://www.immobilienscout24.de/expose/${id}`, manuallyDeleted);
}

/** @param {string} id @returns {{manually_deleted: number}|undefined} */
const listingRow = (id) => db.prepare(`SELECT manually_deleted FROM listings WHERE id = ?`).get(id);

beforeEach(async () => {
  db = await migratedDatabase();
  caller = ALICE;
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => sqliteConnectionFor(() => db));
  // The token check is its own tested layer. Everything after it - the ownership rules included -
  // runs for real.
  vi.doMock(root + '/lib/mcp/mcpAuthentication.js', async (importOriginal) => ({
    ...(await importOriginal()),
    authenticateToolCall: () => ({ user: caller, error: null }),
    authenticateWriteToolCall: async () => ({ user: caller, error: null }),
  }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
  // The global settings come from config.json on disk as well as the table. Demo mode is off.
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getSettings: async () => ({ demoMode: false }),
  }));
  // Two portals instead of loading every provider module, which would pull in the browser stack.
  vi.doMock(root + '/lib/utils.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getProviders: async () => [{ metaInformation: IMMOSCOUT }, { metaInformation: IMMOWELT }],
  }));
  vi.doMock(root + '/lib/services/similarity-check/similarityCache.js', () => ({
    addEntry: vi.fn(),
    readmitDuplicates: vi.fn(),
    removeEntry: vi.fn(),
  }));

  ({ createMcpServer } = await import(root + '/lib/mcp/mcpAdapter.js'));
  jobStorage = await import(root + '/lib/services/storage/jobStorage.js');
  channelStorage = await import(root + '/lib/services/storage/configuredAdapterStorage.js');
  settingsStorage = await import(root + '/lib/services/storage/settingsStorage.js');

  db.exec(`
    INSERT INTO users (id, username, password, is_admin) VALUES ('alice', 'alice', 'x', 0), ('bob', 'bob', 'x', 0);
  `);
  channelStorage.upsertChannel({
    id: 'c1',
    userId: 'alice',
    adapterId: 'telegram',
    name: 'Family',
    fields: { token: 'secret-bot-token', chatId: '111' },
    visibility: 'private',
  });
  jobStorage.upsertJob({
    jobId: 'job-1',
    userId: 'alice',
    name: 'Köln rent',
    enabled: true,
    blacklist: [],
    provider: [
      { id: 'immoscout', name: 'Immoscout', url: KOELN_URL, enabled: true },
      // Switched off by the user. An edit that resends it must not switch it back on.
      { id: 'immowelt', name: 'Immowelt', url: WELT_URL, enabled: false },
    ],
    notificationAdapter: [{ configuredAdapterId: 'c1' }],
    shareWithUsers: [],
    dealType: 'rent',
  });
  jobStorage.upsertJob({
    jobId: 'bob-job',
    userId: 'bob',
    name: 'Bob',
    enabled: true,
    blacklist: [],
    provider: [{ id: 'immoscout', name: 'Immoscout', url: KOELN_URL, enabled: true }],
    notificationAdapter: [],
    shareWithUsers: [],
    dealType: 'rent',
  });
});

afterEach(() => db.close());

describe('get_job, then update_job', () => {
  it('adds a search from what get_job shows, without losing a search or switching one back on', async () => {
    const shown = textOf(await callTool('get_job', { jobId: 'job-1' }));
    // Exactly what a model has to work with: the URLs as get_job prints them.
    const listed = [...shown.matchAll(/^\s+- [^:\n]+: (https:\/\/\S+)/gm)].map((match) => match[1]);
    expect(listed).toEqual([KOELN_URL, WELT_URL]);
    expect(shown).toContain('(switched off)');

    const result = await callTool('update_job', { jobId: 'job-1', providerUrls: [...listed, BONN_URL] });

    expect(result.isError).toBeUndefined();
    expect(jobStorage.getJob('job-1').provider).toEqual([
      { id: 'immoscout', name: 'Immoscout', url: KOELN_URL, enabled: true },
      { id: 'immowelt', name: 'Immowelt', url: WELT_URL, enabled: false },
      { id: 'immoscout', name: 'Immoscout', url: BONN_URL, enabled: true },
    ]);
  });
});

describe('update_channel', () => {
  it("changes a channel's chat id without the token the model was never shown", async () => {
    const listed = textOf(await callTool('list_channels', {}));
    expect(listed).not.toContain('secret-bot-token');

    const result = await callTool('update_channel', { channelId: 'c1', fields: { chatId: '222' } });

    expect(result.isError).toBeUndefined();
    expect(textOf(result)).not.toContain('secret-bot-token');
    expect(channelStorage.getChannel('c1').fields).toEqual({ token: 'secret-bot-token', chatId: '222' });
  });
});

describe('get_user_settings, then update_user_settings', () => {
  it('changes one finance value from what get_user_settings shows, and keeps the rest', async () => {
    settingsStorage.upsertSettings(
      {
        finance_profile: {
          personA: { label: 'A', enabled: true, age: 35, primaryIncome: 3000, secondaryIncome: 0 },
          livingCosts: 900,
          renting: { nebenkostenPct: 25 },
          financing: { equity: 50000, scenarios: [{ id: 'low', annualRate: 3 }] },
        },
        applicant_profile: { fullName: 'Alice Example', phone: '0170 1234567' },
      },
      'alice',
    );

    const shown = textOf(await callTool('get_user_settings', {}));
    expect(shown).toContain('"primaryIncome": 3000');
    expect(shown).toContain('"fullName": "Alice Example"');

    const result = await callTool('update_user_settings', {
      financeProfile: { personA: { primaryIncome: 4000 } },
      applicantProfile: { phone: '0221 987654' },
    });

    expect(result.isError).toBeUndefined();
    const stored = settingsStorage.getUserSettings('alice');
    expect(stored.finance_profile).toEqual({
      personA: { label: 'A', enabled: true, age: 35, primaryIncome: 4000, secondaryIncome: 0 },
      livingCosts: 900,
      renting: { nebenkostenPct: 25 },
      financing: { equity: 50000, scenarios: [{ id: 'low', annualRate: 3 }] },
    });
    expect(stored.applicant_profile).toEqual({ fullName: 'Alice Example', phone: '0221 987654' });
  });
});

describe('delete_listing', () => {
  it('hides a listing, then removes it for good, as its first answer offers', async () => {
    insertListing({ id: 'l1', jobId: 'job-1' });

    const hidden = await callTool('delete_listing', { listingId: 'l1', confirmed: true });
    expect(hidden.isError).toBeUndefined();
    expect(textOf(hidden)).toContain('hard=true');
    expect(listingRow('l1').manually_deleted).toBe(1);

    const removed = await callTool('delete_listing', { listingId: 'l1', hard: true, confirmed: true });
    expect(removed.isError).toBeUndefined();
    expect(textOf(removed)).toContain('permanently');
    expect(listingRow('l1')).toBeUndefined();
  });

  it('still refuses a hidden listing of somebody else’s job', async () => {
    insertListing({ id: 'bobs', jobId: 'bob-job', manuallyDeleted: 1 });

    const result = await callTool('delete_listing', { listingId: 'bobs', hard: true, confirmed: true });

    expect(result.isError).toBe(true);
    expect(listingRow('bobs').manually_deleted).toBe(1);
  });
});

describe('set_listing_status', () => {
  it('puts a listing with a status on the watchlist, as the web route does', async () => {
    insertListing({ id: 'l2', jobId: 'job-1' });

    const result = await callTool('set_listing_status', { listingId: 'l2', status: 'applied' });

    expect(result.isError).toBeUndefined();
    expect(db.prepare(`SELECT 1 FROM watch_list WHERE listing_id = 'l2' AND user_id = 'alice'`).get()).toBeTruthy();
  });
});
