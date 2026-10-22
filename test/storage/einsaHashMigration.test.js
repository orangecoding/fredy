/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/49.einsa-listing-hash.js';
import { config } from '../../lib/provider/einsAImmobilien.js';
import { parse } from '../../lib/services/extractor/parser/parser.js';

const fixture = fs.readFileSync(path.resolve('test/testFixtures/einsAImmobilien.html'), 'utf8');
const normalized = parse(config.crawlContainer, config.crawlFields, fixture, 'https://www.1a-immobilienmarkt.de').map(
  config.normalize,
);
const sha = (s) => createHash('sha256').update(s).digest('hex');

describe('einsAImmobilien listing hash', () => {
  it('differs for two adverts at the same price', () => {
    // 26844881 and 26844882 are two flats at 238.900 EUR on the fixture page.
    const samePrice = normalized.filter((l) => l.price === 238900);
    expect(samePrice).toHaveLength(2);
    expect(samePrice[0].id).not.toBe(samePrice[1].id);
    expect(new Set(normalized.map((l) => l.id)).size).toBe(normalized.length);
  });
});

describe('migration 49 - rekey einsAImmobilien listings', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, hash TEXT, provider TEXT, job_id TEXT, price INTEGER,
                                    link TEXT, created_at INTEGER);
             CREATE UNIQUE INDEX idx_listings_job_hash ON listings (job_id, hash);`);
  });

  afterEach(() => db.close());

  const insert = (id, hash, provider, price, link, createdAt = 1) =>
    db
      .prepare(
        `INSERT INTO listings (id, hash, provider, job_id, price, link, created_at) VALUES (?, ?, ?, 'job', ?, ?, ?)`,
      )
      .run(id, hash, provider, price, link, createdAt);
  const hashOf = (id) => db.prepare(`SELECT hash FROM listings WHERE id = ?`).get(id).hash;

  it('gives every stored row the hash the provider computes now', () => {
    normalized.forEach((l, i) => insert(`row-${i}`, `old-${i}`, 'einsAImmobilien', l.price, l.link));
    up(db);
    normalized.forEach((l, i) => expect(hashOf(`row-${i}`)).toBe(l.id));
  });

  it('hashes the id alone when the row has no price', () => {
    insert('no-price', 'old', 'einsAImmobilien', null, 'https://www.1a-immobilienmarkt.de/expose/123.html');
    up(db);
    expect(hashOf('no-price')).toBe(sha('123'));
  });

  it('leaves the younger of two rows for one advert on its old hash', () => {
    const link = 'https://www.1a-immobilienmarkt.de/expose/123.html';
    insert('older', 'old-a', 'einsAImmobilien', 1000, link, 1);
    insert('younger', 'old-b', 'einsAImmobilien', 1000, link, 2);
    up(db);
    expect(hashOf('older')).toBe(sha('123,1000'));
    expect(hashOf('younger')).toBe('old-b');
  });

  it('leaves other providers alone', () => {
    insert('other', 'keep', 'kleinanzeigen', 1000, 'https://www.1a-immobilienmarkt.de/expose/123.html');
    up(db);
    expect(hashOf('other')).toBe('keep');
  });
});
