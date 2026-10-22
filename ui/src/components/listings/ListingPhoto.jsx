/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';

import { IconHouse } from '../icons/StrokeIcons.jsx';

import './ListingPhoto.less';

/**
 * A listing's photograph, or a drawn house where there is none or it fails to load.
 *
 * The house is drawn rather than a bitmap: the old fallback image was a near-white card with grey
 * lettering, the brightest thing on a dark page, and it said "no image" in English whatever the
 * language. The drawn one takes the surface and the faint tone of whichever theme is on screen.
 *
 * Decorative in both cases: the title next to it says what the listing is, and an `alt` repeating
 * it made a screen reader read every headline twice.
 *
 * @param {Object} props
 * @param {string|null} props.src From `listingPictureSrc`, or null when the listing has no picture.
 * @param {string} [props.className] Sizing and shape, applied to the image and the placeholder alike.
 * @returns {React.ReactElement}
 */
export default function ListingPhoto({ src, className = '' }) {
  const [failed, setFailed] = useState(false);

  if (src == null || failed) {
    return (
      <span className={`listingPhoto listingPhoto--empty ${className}`.trim()}>
        <IconHouse />
      </span>
    );
  }

  return (
    <img
      className={`listingPhoto ${className}`.trim()}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

ListingPhoto.displayName = 'ListingPhoto';
