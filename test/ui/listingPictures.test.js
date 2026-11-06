/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  galleryPictures,
  listingPictureSrc,
  pictureIndexForKey,
} from '../../ui/src/services/listings/listingPictures.js';

describe('listingPictureSrc', () => {
  it('loads the first picture through Fredy, never straight from the portal', () => {
    expect(listingPictureSrc({ id: 'abc', image_url: 'https://pics.test/1.jpg' })).toBe('/api/listings/abc/image');
    expect(listingPictureSrc({ id: 'a/b?c', image_url: 'https://pics.test/1.jpg' })).toBe(
      '/api/listings/a%2Fb%3Fc/image',
    );
  });

  it('has nothing to load for a listing without a picture', () => {
    expect(listingPictureSrc({ id: 'abc', image_url: null })).toBeNull();
    expect(listingPictureSrc({ image_url: 'https://pics.test/1.jpg' })).toBeNull();
    expect(listingPictureSrc(null)).toBeNull();
  });

  /*
   * Every place that shows a listing's picture has to go through the route, or that place goes
   * blank the day the portal takes the advert down while the others keep showing it.
   */
  it('is what every overview loads its pictures from', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const callers = [
      'ui/src/components/grid/listings/ListingsGrid.jsx',
      'ui/src/components/table/ListingsTable.jsx',
      'ui/src/views/listings/listingPopupContent.jsx',
      'ui/src/views/dashboard/components/LatestListings.jsx',
    ];
    for (const file of callers) {
      const source = fs.readFileSync(path.join(root, file), 'utf-8');
      expect(source, file).toMatch(/listingPictureSrc\(/);
      expect(source, file).not.toMatch(/src=\{?["'`$]*\{?\s*(item|row|listing)\.image_url/);
    }
  });
});

describe('galleryPictures', () => {
  const listing = {
    id: 'abc',
    image_url: 'https://pics.test/first.jpg',
    images: [
      { url: 'https://pics.test/plan.jpg', caption: 'Grundriss', floorPlan: true },
      { url: 'https://pics.test/kitchen.jpg', caption: 'Küche' },
      { url: 'https://pics.test/bath.jpg' },
    ],
  };

  it('opens on the first picture and keeps the floor plans for last', () => {
    expect(galleryPictures(listing)).toEqual([
      { src: '/api/listings/abc/image', caption: null, floorPlan: false },
      { src: 'https://pics.test/kitchen.jpg', caption: 'Küche', floorPlan: false },
      { src: 'https://pics.test/bath.jpg', caption: null, floorPlan: false },
      { src: 'https://pics.test/plan.jpg', caption: 'Grundriss', floorPlan: true },
    ]);
  });

  it('is the single picture for a listing stored before galleries were kept', () => {
    expect(galleryPictures({ id: 'abc', image_url: 'https://pics.test/first.jpg' })).toEqual([
      { src: '/api/listings/abc/image', caption: null, floorPlan: false },
    ]);
  });

  it('is empty for a listing without any picture, and skips entries without a url', () => {
    expect(galleryPictures({ id: 'abc', image_url: null })).toEqual([]);
    expect(galleryPictures({ id: 'abc', image_url: null, images: [{ caption: 'x' }, null] })).toEqual([]);
  });
});

describe('pictureIndexForKey', () => {
  const key = (name, modifiers = {}) => ({ key: name, ...modifiers });

  it('steps through the pictures with the left and right arrow keys', () => {
    expect(pictureIndexForKey(key('ArrowRight'), 1, 4)).toBe(2);
    expect(pictureIndexForKey(key('ArrowLeft'), 1, 4)).toBe(0);
  });

  it('wraps around at both ends, as the viewer buttons do', () => {
    expect(pictureIndexForKey(key('ArrowRight'), 3, 4)).toBe(0);
    expect(pictureIndexForKey(key('ArrowLeft'), 0, 4)).toBe(3);
  });

  it('leaves every other key alone', () => {
    for (const name of ['ArrowUp', 'ArrowDown', 'Escape', 'Enter', ' ', 'a']) {
      expect(pictureIndexForKey(key(name), 1, 4), name).toBeNull();
    }
  });

  // Alt+Left is the browser's back, Cmd+Left on a Mac as well. Taking those over would trap the
  // reader on the page instead of showing the previous picture.
  it('leaves the arrow keys alone when a modifier is held', () => {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(pictureIndexForKey(key('ArrowLeft', { [modifier]: true }), 1, 4), modifier).toBeNull();
    }
  });

  it('has nowhere to go with a single picture', () => {
    expect(pictureIndexForKey(key('ArrowRight'), 0, 1)).toBeNull();
    expect(pictureIndexForKey(key('ArrowLeft'), 0, 0)).toBeNull();
  });
});
