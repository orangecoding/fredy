/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { pictureKey, withoutFirstPicture } from '../../lib/utils/listingImages.js';

/**
 * The first picture of a listing comes from the search result, the gallery from the detail page,
 * and the two rarely ask for the same size. Compared as urls, the first picture showed up twice.
 * Every pair below is taken from the provider fixtures.
 */
describe('pictureKey', () => {
  it.each([
    [
      'ImmoScout, search against exposé',
      'https://pictures.immobilienscout24.de/listings/ba3969a3-72d1-4094-b026-ec9476786b82-2063887398.jpg/ORIG/resize/800x600>/format/webp/quality/80',
      'https://pictures.immobilienscout24.de/listings/ba3969a3-72d1-4094-b026-ec9476786b82-2063887398.jpg/ORIG/resize/1500x1000/format/webp/quality/80',
    ],
    [
      'Deutsche Wohnen, card against gallery',
      'https://cdn.expose.vonovia.de/DeuWo-000000576.jpg?width=324&crop=4:3',
      'https://cdn.expose.vonovia.de/DeuWo-000000576.jpg?width=960',
    ],
    [
      'Kleinanzeigen, two rules',
      'https://img.kleinanzeigen.de/api/v1/prod-ads/images/25/2525e2b6-9c77-4007-9896-bcc161d7767a?rule=$_2.AUTO',
      'https://img.kleinanzeigen.de/api/v1/prod-ads/images/25/2525e2b6-9c77-4007-9896-bcc161d7767a?rule=$_59.AUTO',
    ],
    [
      'uploadcare, two operations',
      'https://ucarecdn.com/0f5c1b2e-1111-4a4a-9c9c-123456789abc/-/format/jpeg/-/resize/1080x/',
      'https://ucarecdn.com/0f5c1b2e-1111-4a4a-9c9c-123456789abc/-/resize/400x/',
    ],
  ])('is the same for two sizes of one picture (%s)', (_what, first, second) => {
    expect(pictureKey(first)).toBe(pictureKey(second));
  });

  it('tells different pictures apart', () => {
    expect(pictureKey('https://cdn.expose.vonovia.de/DeuWo-000000576.jpg?width=960')).not.toBe(
      pictureKey('https://cdn.expose.vonovia.de/DeuWo-000000584.jpg?width=960'),
    );
    expect(pictureKey('https://pics.test/image.php?id=1')).not.toBe(pictureKey('https://pics.test/image.php?id=2'));
  });
});

describe('withoutFirstPicture', () => {
  const gallery = [
    { url: 'https://cdn.expose.vonovia.de/DeuWo-000000576.jpg?width=960' },
    { url: 'https://cdn.expose.vonovia.de/DeuWo-000000584.jpg?width=960' },
  ];

  it('drops the first picture in whatever size the gallery has it', () => {
    expect(
      withoutFirstPicture(gallery, 'https://cdn.expose.vonovia.de/DeuWo-000000576.jpg?width=324&crop=4:3'),
    ).toEqual([{ url: 'https://cdn.expose.vonovia.de/DeuWo-000000584.jpg?width=960' }]);
  });

  it('keeps everything when the first picture is not in the gallery, or unknown', () => {
    expect(withoutFirstPicture(gallery, 'https://cdn.expose.vonovia.de/DeuWo-000000999.jpg')).toEqual(gallery);
    expect(withoutFirstPicture(gallery, null)).toEqual(gallery);
  });

  it('falls back to the exact url where the key does not identify a picture', () => {
    const shared = [
      { url: 'https://pics.test/show?id=1' },
      { url: 'https://pics.test/show?id=2' },
      { url: 'https://pics.test/show?id=3' },
    ];

    expect(withoutFirstPicture(shared, 'https://pics.test/show?id=2')).toEqual([
      { url: 'https://pics.test/show?id=1' },
      { url: 'https://pics.test/show?id=3' },
    ]);
    expect(withoutFirstPicture(shared, 'https://pics.test/show?id=9')).toEqual(shared);
  });
});
