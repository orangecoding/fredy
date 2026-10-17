/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { up as createListingMedia } from '../../lib/services/storage/migrations/sql/48.listing-media.js';

/**
 * A listing's pictures: the first one as bytes, the rest of the gallery as deflated urls, written
 * with the listing itself where the provider already had them.
 */
describe('listing media storage', () => {
  let db;
  let media;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        hash TEXT,
        provider TEXT,
        job_id TEXT,
        price REAL,
        charges_included INTEGER,
        charges REAL,
        size REAL,
        rooms REAL,
        build_year INTEGER,
        energy_class TEXT,
        title TEXT,
        image_url TEXT,
        description TEXT,
        address TEXT,
        link TEXT,
        created_at INTEGER,
        published_at INTEGER,
        is_active INTEGER,
        manually_deleted INTEGER DEFAULT 0,
        latitude REAL,
        longitude REAL,
        price_per_sqm REAL,
        UNIQUE (job_id, hash)
      );
    `);
    createListingMedia(db);

    vi.resetModules();
    vi.doMock('../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => (params == null ? db.prepare(sql).all() : db.prepare(sql).all(params)),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    media = await import('../../lib/services/storage/listingMediaStorage.js');
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => {
    db.close();
  });

  const addListing = (id, imageUrl = `https://pics.test/${id}/0.jpg`) =>
    db.prepare(`INSERT INTO listings (id, hash, job_id, image_url) VALUES (?, ?, 'job', ?)`).run(id, id, imageUrl);

  const gallery = (count) =>
    Array.from({ length: count }, (_, index) => ({
      url: `https://pictures.immobilienscout24.de/listings/ba3969a3-72d1-4094-b026-ec9476786b82-20638873${index}.jpg/ORIG/resize/1500x1000/format/webp/quality/80`,
    }));

  describe('gallery', () => {
    it('round-trips, without the picture the listing already shows', () => {
      addListing('l1', 'https://pics.test/first.jpg');
      const images = [
        { url: 'https://pics.test/first.jpg' },
        { url: 'https://pics.test/second.jpg', caption: 'Küche' },
        { url: 'https://pics.test/plan.jpg', caption: 'Grundriss EG', floorPlan: true },
      ];

      expect(media.storeListingGallery('l1', images, 'https://pics.test/first.jpg')).toBe(true);

      expect(media.getListingGallery('l1')).toEqual([
        { url: 'https://pics.test/plan.jpg', caption: 'Grundriss EG', floorPlan: true },
        { url: 'https://pics.test/second.jpg', caption: 'Küche' },
      ]);
    });

    it('leaves out the first picture even when the detail page asks for another size of it', () => {
      const search =
        'https://pictures.immobilienscout24.de/listings/ba3969a3-72d1-4094-b026-ec9476786b82-2063887398.jpg/ORIG/resize/800x600>/format/webp/quality/80';
      const expose = (id) =>
        `https://pictures.immobilienscout24.de/listings/${id}.jpg/ORIG/resize/1500x1000/format/webp/quality/80`;
      addListing('l1', search);

      media.storeListingGallery(
        'l1',
        [{ url: expose('ba3969a3-72d1-4094-b026-ec9476786b82-2063887398') }, { url: expose('second') }],
        search,
      );

      expect(media.getListingGallery('l1', search)).toEqual([{ url: expose('second') }]);
    });

    it('reads a gallery stored with the first picture still in it without that picture', () => {
      addListing('l1', 'https://cdn.expose.vonovia.de/DeuWo-1.jpg?width=324&crop=4:3');
      db.prepare(`INSERT INTO listing_media (listing_id, gallery, created_at) VALUES ('l1', ?, 1)`).run(
        media.encodeGallery([
          { url: 'https://cdn.expose.vonovia.de/DeuWo-1.jpg?width=960' },
          { url: 'https://cdn.expose.vonovia.de/DeuWo-2.jpg?width=960' },
        ]),
      );

      expect(media.getListingGallery('l1', 'https://cdn.expose.vonovia.de/DeuWo-1.jpg?width=324&crop=4:3')).toEqual([
        { url: 'https://cdn.expose.vonovia.de/DeuWo-2.jpg?width=960' },
      ]);
      // A refetch rewrites it without the duplicate, so storage stops carrying it too.
      expect(
        media.storeListingGallery(
          'l1',
          [
            { url: 'https://cdn.expose.vonovia.de/DeuWo-1.jpg?width=960' },
            { url: 'https://cdn.expose.vonovia.de/DeuWo-2.jpg?width=960' },
          ],
          'https://cdn.expose.vonovia.de/DeuWo-1.jpg?width=324&crop=4:3',
        ),
      ).toBe(false);
    });

    it('stores the urls in a fraction of their JSON', () => {
      addListing('l1');
      const images = gallery(16);
      media.storeListingGallery('l1', images, null);

      const stored = db.prepare(`SELECT gallery FROM listing_media WHERE listing_id = 'l1'`).get().gallery;
      expect(stored.length).toBeLessThan(JSON.stringify(images).length / 3);
    });

    it('never wipes a stored gallery with an empty one, and does not rewrite an unchanged one', () => {
      addListing('l1');
      media.storeListingGallery('l1', gallery(3), null);

      expect(media.storeListingGallery('l1', [], null)).toBe(false);
      expect(media.storeListingGallery('l1', undefined, null)).toBe(false);
      expect(media.storeListingGallery('l1', gallery(3), null)).toBe(false);
      expect(media.getListingGallery('l1')).toHaveLength(3);

      expect(media.storeListingGallery('l1', gallery(4), null)).toBe(true);
      expect(media.getListingGallery('l1')).toHaveLength(4);
    });

    it('reads an unreadable gallery as none rather than failing the listing', () => {
      addListing('l1');
      db.prepare(`INSERT INTO listing_media (listing_id, gallery, created_at) VALUES ('l1', ?, 1)`).run(
        Buffer.from('not deflated at all'),
      );

      expect(media.getListingGallery('l1')).toEqual([]);
      expect(media.getListingGallery('unknown')).toEqual([]);
      expect(media.decodeGallery(null)).toEqual([]);
    });
  });

  describe('first picture', () => {
    it('is served from the database once kept, and the portal url is still known', () => {
      addListing('l1', 'https://pics.test/first.jpg');
      const bytes = Buffer.from('RIFF\0\0\0\0WEBPVP8 ');

      media.storeListingPreview('l1', bytes, 'image/webp');

      expect(media.getListingPicture('l1')).toEqual({
        imageUrl: 'https://pics.test/first.jpg',
        content: bytes,
        mimeType: 'image/webp',
        failedAt: null,
      });
      expect(media.getPreviewState('l1')).toEqual({ hasPreview: true, failedAt: null });
    });

    it('answers with the portal url for a listing whose picture is not kept yet', () => {
      addListing('l1', 'https://pics.test/first.jpg');

      expect(media.getListingPicture('l1')).toEqual({
        imageUrl: 'https://pics.test/first.jpg',
        content: null,
        mimeType: null,
        failedAt: null,
      });
      expect(media.getPreviewState('l1')).toEqual({ hasPreview: false, failedAt: null });
      expect(media.getListingPicture('unknown')).toBeNull();
    });

    it('remembers a failure, and forgets it once the picture is kept', () => {
      addListing('l1');

      media.markListingPreviewFailed('l1', 1234);
      expect(media.getPreviewState('l1')).toEqual({ hasPreview: false, failedAt: 1234 });

      media.storeListingPreview('l1', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
      expect(media.getPreviewState('l1')).toEqual({ hasPreview: true, failedAt: null });
    });

    it('keeps the gallery when the picture arrives, and the picture when the gallery does', () => {
      addListing('l1');
      media.storeListingGallery('l1', gallery(2), null);
      media.storeListingPreview('l1', Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
      media.storeListingGallery('l1', gallery(5), null);

      expect(media.getListingGallery('l1')).toHaveLength(5);
      expect(media.getPreviewState('l1').hasPreview).toBe(true);
    });

    it('refuses to keep anything for a listing that is gone', () => {
      expect(() => media.storeListingPreview('ghost', Buffer.from([1]), 'image/jpeg')).toThrow(/FOREIGN KEY/);
    });
  });

  describe('storeListings', () => {
    const listing = (hash, overrides = {}) => ({
      id: hash,
      price: 900,
      size: 50,
      rooms: 2,
      title: `Flat ${hash}`,
      image: `https://pics.test/${hash}/0.jpg`,
      description: 'nice',
      address: 'Bahlenstraße 1, Düsseldorf',
      link: `https://example.com/${hash}`,
      ...overrides,
    });

    it('writes the gallery a provider already loaded together with the listing', () => {
      const items = [
        listing('with', {
          images: [{ url: 'https://pics.test/with/0.jpg' }, { url: 'https://pics.test/with/1.jpg' }],
        }),
        listing('without'),
      ];

      listingsStorage.storeListings('job', 'immoscout', items);

      const [withGallery, without] = items;
      expect(media.getListingGallery(withGallery.id)).toEqual([{ url: 'https://pics.test/with/1.jpg' }]);
      expect(media.getListingGallery(without.id)).toEqual([]);
      expect(db.prepare(`SELECT COUNT(*) AS total FROM listing_media`).get().total).toBe(1);
    });
  });
});
