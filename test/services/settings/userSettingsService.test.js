/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { migratedDatabase, sqliteConnectionFor } from '../../mocks/migratedDatabase.js';

/*
 * The settings save the settings pages and the MCP `update_user_settings` tool share, against the
 * production schema. The address save behind it geocodes and recomputes distances, which is its own
 * tested behaviour (homeAddressInvalidation.test.js), so it is a stand-in here.
 */

const root = path.resolve('.');
const ALICE = { id: 'alice', isAdmin: false };
const ADMIN = { id: 'root', isAdmin: true };

let db;
let demoMode;
let addressSave;
let service;
let settingsStorage;

beforeEach(async () => {
  db = await migratedDatabase();
  demoMode = false;
  addressSave = vi.fn(async (userId, homeAddresses) => ({ ok: true, home_addresses: homeAddresses, queued: 0 }));
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => sqliteConnectionFor(() => db));
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getSettings: async () => ({ demoMode }),
  }));
  vi.doMock(root + '/lib/services/settings/homeAddressService.js', () => ({ saveHomeAddresses: addressSave }));
  service = await import(root + '/lib/services/settings/userSettingsService.js');
  settingsStorage = await import(root + '/lib/services/storage/settingsStorage.js');
  db.exec(
    `INSERT INTO users (id, username, password, is_admin) VALUES ('alice', 'alice', 'x', 0), ('root', 'root', 'x', 1)`,
  );
});

afterEach(() => db.close());

const stored = () => settingsStorage.getUserSettings('alice');

const PROFILE = {
  personA: { label: 'A', primaryIncome: 3000, secondaryIncome: 0 },
  livingCosts: 900,
  financing: { equity: 50000, scenarios: [{ id: 'low', annualRate: 3 }] },
};

describe('the profiles', () => {
  it('replaces a profile, as the settings page sends one whole', async () => {
    settingsStorage.upsertSettings({ finance_profile: PROFILE }, 'alice');
    await service.updateUserSettings(ALICE, { financeProfile: { livingCosts: 1000 } });
    expect(stored().finance_profile).toEqual({ livingCosts: 1000 });
  });

  it('merges a change into the stored profile when asked to, as the MCP tool does', async () => {
    settingsStorage.upsertSettings({ finance_profile: PROFILE }, 'alice');
    const saved = await service.updateUserSettings(
      ALICE,
      { financeProfile: { personA: { primaryIncome: 4000 }, financing: { scenarios: [] } } },
      { mergeProfiles: true },
    );
    expect(saved.ok).toBe(true);
    expect(stored().finance_profile).toEqual({
      personA: { label: 'A', primaryIncome: 4000, secondaryIncome: 0 },
      livingCosts: 900,
      financing: { equity: 50000, scenarios: [] },
    });
  });

  it('clears a profile with null, and with a merge that leaves nothing in it', async () => {
    settingsStorage.upsertSettings({ applicant_profile: { phone: '1' }, finance_profile: PROFILE }, 'alice');
    await service.updateUserSettings(ALICE, { applicantProfile: { phone: null } }, { mergeProfiles: true });
    await service.updateUserSettings(ALICE, { financeProfile: null });
    expect(stored().applicant_profile).toBeUndefined();
    expect(stored().finance_profile).toBeUndefined();
  });

  it('holds the applicant profile to its cap after the merge, since small patches add up', async () => {
    const half = 'x'.repeat(service.MAX_APPLICANT_PROFILE_LENGTH / 2);
    await service.updateUserSettings(ALICE, { applicantProfile: { a: half } });
    const saved = await service.updateUserSettings(ALICE, { applicantProfile: { b: half } }, { mergeProfiles: true });
    expect(saved).toMatchObject({ ok: false, reason: 'invalid' });
    expect(stored().applicant_profile).toEqual({ a: half });
  });

  it('refuses a profile that is not an object', async () => {
    expect(await service.updateUserSettings(ALICE, { financeProfile: [1, 2] })).toMatchObject({ ok: false });
    expect(await service.updateUserSettings(ALICE, { applicantProfile: undefined })).toMatchObject({ ok: false });
  });
});

describe('all or nothing', () => {
  it('stores none of a patch when one key is refused', async () => {
    const saved = await service.updateUserSettings(ALICE, { language: 'de', theme: 'pink' });
    expect(saved).toMatchObject({ ok: false, reason: 'invalid' });
    expect(stored().language).toBeUndefined();
  });

  it('stores none of the rest when the address save refuses the list', async () => {
    addressSave.mockResolvedValueOnce({ ok: false, reason: 'invalid', error: 'Each address needs its own name.' });
    const saved = await service.updateUserSettings(ALICE, { language: 'de', homeAddresses: [{}, {}] });
    expect(saved).toEqual({ ok: false, reason: 'invalid', error: 'Each address needs its own name.' });
    expect(stored().language).toBeUndefined();
  });

  it('refuses a setting it does not know', async () => {
    expect(await service.updateUserSettings(ALICE, { is_admin: true })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('demo mode', () => {
  it('locks the addresses and the profiles for everyone but an admin, not the language or theme', async () => {
    demoMode = true;
    expect(await service.updateUserSettings(ALICE, { homeAddresses: [] })).toMatchObject({ code: 'demoMode' });
    expect(await service.updateUserSettings(ALICE, { financeProfile: PROFILE })).toMatchObject({ code: 'demoMode' });
    expect(await service.updateUserSettings(ALICE, { applicantProfile: {} })).toMatchObject({ code: 'demoMode' });
    expect(addressSave).not.toHaveBeenCalled();

    expect((await service.updateUserSettings(ALICE, { language: 'de', theme: 'light' })).ok).toBe(true);
    expect((await service.updateUserSettings(ADMIN, { financeProfile: PROFILE })).ok).toBe(true);
  });
});

describe('language and theme', () => {
  it('stores the language trimmed, and says which theme was on screen before', async () => {
    const first = await service.updateUserSettings(ALICE, { language: ' de ', theme: 'light' });
    expect(first.changes).toEqual({ language: 'de', theme: { value: 'light', previous: 'dark' } });
    const second = await service.updateUserSettings(ALICE, { theme: 'dark' });
    expect(second.changes.theme).toEqual({ value: 'dark', previous: 'light' });
    expect(stored()).toMatchObject({ language: 'de', theme: 'dark' });
  });
});
