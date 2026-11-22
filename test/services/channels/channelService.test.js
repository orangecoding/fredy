/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { migratedDatabase, sqliteConnectionFor } from '../../mocks/migratedDatabase.js';

/*
 * The one channel save the web form and the MCP channel tools share, against the production schema
 * and the real adapter catalog. Both callers' own tests go through it too; these pin down the rules
 * themselves, and that the one difference between the callers - replace or merge the field bag - is
 * the only one.
 */

const root = path.resolve('.');
const ALICE = { id: 'alice', isAdmin: false };
const BOB = { id: 'bob', isAdmin: false };

let db;
let service;
let storage;

beforeEach(async () => {
  db = await migratedDatabase();
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/SqliteConnection.js', () => sqliteConnectionFor(() => db));
  service = await import(root + '/lib/services/channels/channelService.js');
  storage = await import(root + '/lib/services/storage/configuredAdapterStorage.js');
  db.exec(
    `INSERT INTO users (id, username, password, is_admin) VALUES ('alice', 'alice', 'x', 0), ('bob', 'bob', 'x', 0)`,
  );
});

afterEach(() => db.close());

/** @returns {string} The id of Alice's telegram channel, with a thread id set. */
const seedTelegram = () =>
  storage.upsertChannel({
    userId: 'alice',
    adapterId: 'telegram',
    name: 'Family',
    fields: { token: 'tok', chatId: '111', messageThreadId: '7' },
    visibility: 'private',
  });

describe('saveChannel: what is stored', () => {
  it('replaces the field bag when the caller sends one, as the web form does', async () => {
    const id = seedTelegram();
    const saved = await service.saveChannel(ALICE, { id, fields: { token: 'tok', chatId: '222' } });
    expect(saved.ok).toBe(true);
    expect(storage.getChannel(id).fields).toEqual({ token: 'tok', chatId: '222' });
  });

  it('merges the fields it was sent into the stored ones when asked to, as the MCP tools do', async () => {
    const id = seedTelegram();
    const saved = await service.saveChannel(ALICE, { id, fields: { chatId: '222' } }, { mergeFields: true });
    expect(saved.ok).toBe(true);
    expect(storage.getChannel(id).fields).toEqual({ token: 'tok', chatId: '222', messageThreadId: '7' });
  });

  it('keeps the stored fields and name when the caller sends neither, in both modes', async () => {
    const id = seedTelegram();
    for (const mergeFields of [false, true]) {
      expect((await service.saveChannel(ALICE, { id }, { mergeFields })).ok).toBe(true);
      expect(storage.getChannel(id)).toMatchObject({ name: 'Family', fields: { token: 'tok', chatId: '111' } });
    }
  });
});

describe('saveChannel: what is refused, whichever caller asks', () => {
  it.each([false, true])('a create without a field the adapter needs (mergeFields=%s)', async (mergeFields) => {
    const saved = await service.saveChannel(
      ALICE,
      { adapterId: 'telegram', name: 'New', fields: { token: 'tok' } },
      { mergeFields },
    );
    expect(saved).toMatchObject({ ok: false, reason: 'invalid', code: 'missingFields', missing: ['chatId'] });
    expect(storage.getAllChannels()).toHaveLength(0);
  });

  it.each([false, true])('a field name the adapter does not have (mergeFields=%s)', async (mergeFields) => {
    const id = seedTelegram();
    const saved = await service.saveChannel(ALICE, { id, fields: { token: 'tok', chatID: '9' } }, { mergeFields });
    expect(saved).toMatchObject({ ok: false, reason: 'invalid', code: 'unknownFields' });
    expect(saved.error).toContain('"chatID"');
    expect(storage.getChannel(id).fields.chatId).toBe('111');
  });

  it('a channel somebody else owns', async () => {
    const id = seedTelegram();
    expect(await service.saveChannel(BOB, { id, name: 'Mine now' })).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(storage.getChannel(id).name).toBe('Family');
  });

  it('a blank name, and a create without one', async () => {
    const id = seedTelegram();
    expect(await service.saveChannel(ALICE, { id, name: '  ' })).toMatchObject({ ok: false, code: 'name' });
    expect(
      await service.saveChannel(ALICE, { adapterId: 'telegram', fields: { token: 't', chatId: '1' } }),
    ).toMatchObject({ ok: false, code: 'name' });
  });

  it('a privileged field from a non-admin, and lets an admin set it', async () => {
    const body = { adapterId: 'sqlite', name: 'Local', fields: { dbPath: '/tmp/elsewhere.db' } };
    expect(await service.saveChannel(ALICE, body)).toMatchObject({ ok: false, code: 'privilegedField' });
    expect((await service.saveChannel({ id: 'alice', isAdmin: true }, body)).ok).toBe(true);
  });

  it('a share from a non-admin: their channel stays private', async () => {
    const saved = await service.saveChannel(ALICE, {
      adapterId: 'telegram',
      name: 'New',
      fields: { token: 't', chatId: '1' },
      visibility: 'everyone',
    });
    expect(saved.channel.visibility).toBe('private');
  });
});

describe('deleteChannel', () => {
  it('checks without deleting on a dry run, then deletes', () => {
    const id = seedTelegram();
    expect(service.deleteChannel(ALICE, id, { dryRun: true }).ok).toBe(true);
    expect(storage.getChannel(id)).not.toBeNull();
    expect(service.deleteChannel(ALICE, id).ok).toBe(true);
    expect(storage.getChannel(id)).toBeNull();
  });

  it('refuses a channel a job still sends through, and names the job, even on a dry run', () => {
    const id = seedTelegram();
    db.prepare(
      `INSERT INTO jobs (id, user_id, name, enabled, notification_adapter) VALUES ('j1', 'alice', 'Köln', 1, ?)`,
    ).run(JSON.stringify([{ configuredAdapterId: id }]));
    const refused = service.deleteChannel(ALICE, id, { dryRun: true });
    expect(refused).toMatchObject({ ok: false, reason: 'conflict', code: 'inUse' });
    expect(refused.error).toContain('"Köln"');
  });
});

describe('listUsableChannels', () => {
  it("lists the user's own and shared channels, never another user's private one, and no field values", async () => {
    seedTelegram();
    storage.upsertChannel({
      userId: 'bob',
      adapterId: 'telegram',
      name: 'Bob only',
      fields: {},
      visibility: 'private',
    });
    storage.upsertChannel({
      userId: 'bob',
      adapterId: 'telegram',
      name: 'Bob shared',
      fields: {},
      visibility: 'everyone',
    });

    const listed = await service.listUsableChannels(ALICE);

    expect(listed.map((channel) => channel.name).sort()).toEqual(['Bob shared', 'Family']);
    expect(JSON.stringify(listed)).not.toContain('tok');
    expect(listed.find((channel) => channel.name === 'Bob shared')).toMatchObject({ canEdit: false, isOwner: false });
  });
});
