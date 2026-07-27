/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The cleanup runs plain SQL, so the test backs the mocked SqliteConnection with a real
 * in-memory database. That keeps the assertions honest (transactions, ON DELETE CASCADE)
 * without touching the real listings.db.
 */
let db;

const sqliteMock = {
  execute: (sql, params = {}) => db.prepare(sql).run(params),
  query: (sql, params = {}) => db.prepare(sql).all(params),
  withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
};

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: sqliteMock,
}));

const provider = (id) => ({ metaInformation: { id } });

const addJob = (id, name, providerConfig) =>
  db.prepare(`INSERT INTO jobs (id, name, provider) VALUES (?, ?, ?)`).run(id, name, JSON.stringify(providerConfig));

const addListing = (id, providerId, jobId = 'job-1') =>
  db.prepare(`INSERT INTO listings (id, provider, job_id) VALUES (?, ?, ?)`).run(id, providerId, jobId);

const providerConfigOf = (id) => JSON.parse(db.prepare(`SELECT provider FROM jobs WHERE id = ?`).get(id).provider);

const listingIds = () =>
  db
    .prepare(`SELECT id FROM listings ORDER BY id`)
    .all()
    .map((row) => row.id);

describe('providerCleanup', () => {
  let removeObsoleteProviders;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, name TEXT, provider TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE listings (
        id       TEXT PRIMARY KEY,
        provider TEXT,
        job_id   TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
      );
      CREATE TABLE watch_list (
        id         TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE
      );
    `);
    addJob('job-1', 'Test', [{ id: 'immoscout', url: 'https://example.org' }]);

    ({ removeObsoleteProviders } = await import('../../lib/services/providers/providerCleanup.js'));
  });

  afterEach(() => db.close());

  describe('job configs', () => {
    it('removes a provider that no longer exists and keeps the remaining ones', () => {
      addJob('job-2', 'Mixed', [{ id: 'immoscout' }, { id: 'immonet', url: 'https://immonet.de' }]);

      const result = removeObsoleteProviders([provider('immoscout')]);

      expect(providerConfigOf('job-2')).toEqual([{ id: 'immoscout' }]);
      expect(result.jobsUpdated).toBe(1);
      expect(result.providerConfigsRemoved).toBe(1);
      expect(result.obsoleteProviderIds).toEqual(['immonet']);
    });

    it('empties the config of a job that only used obsolete providers', () => {
      addJob('job-2', 'Dead', [{ id: 'immonet' }, { id: 'wohnungsboerse' }]);

      removeObsoleteProviders([provider('immoscout')]);

      expect(providerConfigOf('job-2')).toEqual([]);
    });

    it('leaves jobs untouched when every configured provider still exists', () => {
      const result = removeObsoleteProviders([provider('immoscout'), provider('immowelt')]);

      expect(providerConfigOf('job-1')).toEqual([{ id: 'immoscout', url: 'https://example.org' }]);
      expect(result.jobsUpdated).toBe(0);
      expect(result.obsoleteProviderIds).toEqual([]);
    });
  });

  describe('listings', () => {
    it('removes listings of an obsolete provider and keeps the others', () => {
      addListing('keep-1', 'immoscout');
      addListing('drop-1', 'immonet');
      addListing('drop-2', 'immonet');

      const result = removeObsoleteProviders([provider('immoscout')]);

      expect(listingIds()).toEqual(['keep-1']);
      expect(result.listingsRemoved).toBe(2);
      expect(result.obsoleteProviderIds).toEqual(['immonet']);
    });

    it('removes listings that carry no provider at all', () => {
      addListing('keep-1', 'immoscout');
      addListing('orphan-1', null);

      const result = removeObsoleteProviders([provider('immoscout')]);

      expect(listingIds()).toEqual(['keep-1']);
      expect(result.listingsRemoved).toBe(1);
      expect(result.obsoleteProviderIds).toEqual(['unknown']);
    });

    it('drops watch list entries of removed listings', () => {
      addListing('drop-1', 'immonet');
      db.prepare(`INSERT INTO watch_list (id, listing_id) VALUES ('w-1', 'drop-1')`).run();

      removeObsoleteProviders([provider('immoscout')]);

      expect(db.prepare(`SELECT COUNT(1) AS c FROM watch_list`).get().c).toBe(0);
    });
  });

  it('reports job and listing cleanup together', () => {
    addJob('job-2', 'Mixed', [{ id: 'immoscout' }, { id: 'immonet' }]);
    addListing('drop-1', 'immonet');

    const result = removeObsoleteProviders([provider('immoscout')]);

    expect(result).toEqual({
      obsoleteProviderIds: ['immonet'],
      jobsUpdated: 1,
      providerConfigsRemoved: 1,
      listingsRemoved: 1,
    });
  });

  it('does nothing when no provider module could be loaded', () => {
    addListing('keep-1', 'immoscout');

    const result = removeObsoleteProviders([]);

    expect(listingIds()).toEqual(['keep-1']);
    expect(providerConfigOf('job-1')).toEqual([{ id: 'immoscout', url: 'https://example.org' }]);
    expect(result).toEqual({
      obsoleteProviderIds: [],
      jobsUpdated: 0,
      providerConfigsRemoved: 0,
      listingsRemoved: 0,
    });
  });
});
