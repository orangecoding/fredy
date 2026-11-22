/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
  setListingStatus: vi.fn(() => 1),
  deleteListingsById: vi.fn(),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  ensureWatch: vi.fn(() => ({ watched: true })),
  deleteWatch: vi.fn(() => ({ deleted: true })),
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  queryJobs: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getJob: vi.fn(),
  upsertJob: vi.fn(),
  setJobStatus: vi.fn(),
  removeJob: vi.fn(),
}));
vi.mock('../../lib/services/storage/configuredAdapterStorage.js', () => ({
  getAllChannels: vi.fn(() => []),
  getChannel: vi.fn(),
  upsertChannel: vi.fn(),
  removeChannel: vi.fn(),
  getJobsUsingChannel: vi.fn(() => []),
  getUsageCounts: vi.fn(() => new Map()),
  normaliseVisibility: (value) => (['private', 'admin', 'everyone'].includes(value) ? value : 'private'),
  VISIBILITY: Object.freeze({ PRIVATE: 'private', ADMIN: 'admin', EVERYONE: 'everyone' }),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getUserSettings: vi.fn(() => ({})),
  upsertSettings: vi.fn(),
  // The settings save asks whether demo mode locks the profiles and the addresses; it does not.
  getSettings: vi.fn(async () => ({ demoMode: false })),
}));
// The shared save the web form and this tool both run: mocked here because what it sets off
// (geocoding, distance recomputation, the travel-time sweeper) is its own tested behaviour.
vi.mock('../../lib/services/settings/homeAddressService.js', () => ({
  saveHomeAddresses: vi.fn(async () => ({ ok: true, home_addresses: [], queued: 3 })),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/jobDraftContext.js', () => ({ buildDraftContext: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getUserSettings, upsertSettings } from '../../lib/services/storage/settingsStorage.js';
import { saveHomeAddresses } from '../../lib/services/settings/homeAddressService.js';
import { trackPoi } from '../../lib/services/tracking/Tracker.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { TRACKING_POIS } from '../../lib/TRACKING_POIS.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

const USER = { id: 'u1', isAdmin: false };

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

beforeEach(() => {
  vi.clearAllMocks();
  authenticateWriteToolCall.mockImplementation(async () => ({ user: USER, error: null }));
  getUserSettings.mockReturnValue({});
  saveHomeAddresses.mockResolvedValue({ ok: true, home_addresses: [], queued: 3 });
});

describe('get_user_settings', () => {
  it('shows the settings the update tool can change', async () => {
    getUserSettings.mockReturnValue({
      language: 'de',
      theme: 'dark',
      home_addresses: [{ label: 'Home', address: 'Hauptstrasse 1, Köln', mode: 'transit' }],
      finance_profile: { personA: { enabled: true, primaryIncome: 3000, secondaryIncome: 0 } },
      applicant_profile: { name: 'Max', occupation: 'Engineer' },
    });

    const result = await callTool('get_user_settings', {});
    const text = textOf(result);

    expect(result.isError).toBeUndefined();
    expect(text).toContain('de');
    expect(text).toContain('Home');
    expect(text).toContain('Hauptstrasse 1, Köln');
    expect(text).toContain('saved');
    expect(text).toContain('3000');
    expect(text).toContain('update_user_settings');
    // In full, as the keys the update tool merges into - not just "saved".
    expect(text).toContain('"primaryIncome": 3000');
    expect(text).toContain('"occupation": "Engineer"');
  });

  it('fences a profile so backticks the user typed cannot close the block early', async () => {
    getUserSettings.mockReturnValue({ applicant_profile: { note: 'see ```here```' } });

    const text = textOf(await callTool('get_user_settings', {}));

    expect(text).toContain('````json');
  });

  it('says which of the two profiles is not set yet', async () => {
    const text = textOf(await callTool('get_user_settings', {}));

    expect(text).toContain('not set');
  });
});

describe('update_user_settings', () => {
  it('changes the language the user asked for', async () => {
    const result = await callTool('update_user_settings', { language: 'de' });

    expect(upsertSettings).toHaveBeenCalledWith({ language: 'de' }, 'u1');
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('language set to de');
    expect(trackPoi).toHaveBeenCalledWith(TRACKING_POIS.MCP_SETTINGS_CHANGED);
  });

  it('changes the theme', async () => {
    await callTool('update_user_settings', { theme: 'light' });

    expect(upsertSettings).toHaveBeenCalledWith({ theme: 'light' }, 'u1');
  });

  it('saves the addresses through the same save the web form runs', async () => {
    const addresses = [{ label: 'Home', address: 'Hauptstrasse 1, Köln' }];

    const result = await callTool('update_user_settings', { homeAddresses: addresses });

    expect(saveHomeAddresses).toHaveBeenCalledWith('u1', addresses);
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toContain('home addresses saved');
    // The recompute is why the answer mentions catch-up: distances and travel times fill in later.
    expect(textOf(result)).toContain('background');
  });

  it('relays a refused address save as an error, and changes nothing else', async () => {
    saveHomeAddresses.mockResolvedValue({ ok: false, reason: 'invalid', error: 'Each address needs its own name.' });

    const result = await callTool('update_user_settings', { language: 'de', homeAddresses: [] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('own name');
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it('saves the finance profile, and clears it with null', async () => {
    await callTool('update_user_settings', { financeProfile: { personA: { enabled: true } } });
    expect(upsertSettings).toHaveBeenCalledWith({ finance_profile: { personA: { enabled: true } } }, 'u1');

    vi.clearAllMocks();
    await callTool('update_user_settings', { financeProfile: null });
    expect(upsertSettings).toHaveBeenCalledWith({ finance_profile: null }, 'u1');
  });

  it('merges a finance change into the stored profile instead of replacing it', async () => {
    getUserSettings.mockReturnValue({
      finance_profile: {
        personA: { enabled: true, primaryIncome: 3000, age: 35 },
        livingCosts: 900,
        financing: { equity: 50000, scenarios: [{ id: 'low', annualRate: 3 }] },
      },
    });

    await callTool('update_user_settings', {
      financeProfile: { personA: { primaryIncome: 4000 }, financing: { scenarios: [{ id: 'mid', annualRate: 3.8 }] } },
    });

    expect(upsertSettings).toHaveBeenCalledWith(
      {
        finance_profile: {
          personA: { enabled: true, primaryIncome: 4000, age: 35 },
          livingCosts: 900,
          // A list replaces; the object around it merges.
          financing: { equity: 50000, scenarios: [{ id: 'mid', annualRate: 3.8 }] },
        },
      },
      'u1',
    );
  });

  it('removes a profile key sent as null, and clears a profile left with nothing in it', async () => {
    getUserSettings.mockReturnValue({ applicant_profile: { phone: '0170', pets: 'none' } });

    await callTool('update_user_settings', { applicantProfile: { pets: null } });
    expect(upsertSettings).toHaveBeenCalledWith({ applicant_profile: { phone: '0170' } }, 'u1');

    vi.clearAllMocks();
    getUserSettings.mockReturnValue({ applicant_profile: { phone: '0170' } });
    await callTool('update_user_settings', { applicantProfile: { phone: null } });
    expect(upsertSettings).toHaveBeenCalledWith({ applicant_profile: null }, 'u1');
  });

  it('never lets a patch key reach the prototype of the stored profile', async () => {
    getUserSettings.mockReturnValue({ applicant_profile: { phone: '0170' } });

    await callTool('update_user_settings', { applicantProfile: JSON.parse('{"__proto__": {"isAdmin": true}}') });

    const stored = upsertSettings.mock.calls[0][0].applicant_profile;
    expect(stored).toEqual({ phone: '0170' });
    expect(Object.getPrototypeOf(stored)).toBe(Object.prototype);
  });

  it('applies the length cap to the merged profile, not only to the patch', async () => {
    getUserSettings.mockReturnValue({ applicant_profile: { bio: 'x'.repeat(19_990) } });

    const result = await callTool('update_user_settings', { applicantProfile: { phone: '0170 1234567' } });

    expect(result.isError).toBe(true);
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it('saves the applicant profile under the same length cap the route enforces', async () => {
    await callTool('update_user_settings', { applicantProfile: { name: 'Max' } });
    expect(upsertSettings).toHaveBeenCalledWith({ applicant_profile: { name: 'Max' } }, 'u1');
  });

  it('refuses an applicant profile past the cap, and stores nothing', async () => {
    const result = await callTool('update_user_settings', { applicantProfile: { bio: 'x'.repeat(21_000) } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('20000');
    expect(upsertSettings).not.toHaveBeenCalled();
  });

  it('refuses a call that changes nothing', async () => {
    const result = await callTool('update_user_settings', {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Nothing to change');
    expect(upsertSettings).not.toHaveBeenCalled();
    expect(trackPoi).not.toHaveBeenCalled();
  });
});
