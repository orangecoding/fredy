/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { Image, ImagePreview, Typography } from '@douyinfe/semi-ui-19';
import { IconMaximize } from '@douyinfe/semi-icons';

import no_image from '../../../assets/no_image.png';
import { galleryPictures } from '../../../services/listings/listingPictures.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './ListingPictures.less';

const { Text } = Typography;

/**
 * The pictures of a listing: the selected one large, every one of them as a thumbnail underneath,
 * and all of them in a full-screen viewer.
 *
 * The first picture comes from Fredy's own route and is the copy kept in the database; the rest are
 * the portal's urls the provider had already loaded. A listing with a single picture, which is every
 * listing found before galleries were kept, looks exactly as the page did before: one picture, no
 * strip.
 *
 * @param {Object} props
 * @param {Object} props.listing A listing as the detail route returns it, `images` included.
 * @returns {JSX.Element}
 */
export default function ListingPictures({ listing }) {
  const t = useTranslation();
  const pictures = useMemo(() => galleryPictures(listing), [listing]);
  const [active, setActive] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Another listing opens on its own first picture, not on whichever index the last one was left at.
  useEffect(() => {
    setActive(0);
    setViewerOpen(false);
  }, [listing.id]);

  const current = pictures[active] ?? pictures[0] ?? null;
  const showStrip = pictures.length > 1;

  return (
    <section className="listing-detail__media listing-detail__sec--media">
      <div className={`listing-detail__image${current == null ? ' listing-detail__image--placeholder' : ''}`}>
        <Image
          key={current?.src ?? 'none'}
          src={current?.src ?? no_image}
          fallback={<img src={no_image} alt={t('listing.detail.noImageAlt')} />}
          alt={current?.caption || listing.title || t('listing.detail.defaultTitle')}
          style={{ width: '100%', height: '100%' }}
          preview={false}
          onClick={current == null ? undefined : () => setViewerOpen(true)}
        />
        {/* A plain button rather than a Semi one: it sits on a photograph, so its colours
            are the scrim's and not the theme's, and fighting a component's own palette with
            `!important` to get there is the worse trade. */}
        {current != null && (
          <button
            type="button"
            className="listing-detail__image-expand"
            aria-label={t('listing.detail.expandImage')}
            onClick={() => setViewerOpen(true)}
          >
            <IconMaximize aria-hidden="true" />
          </button>
        )}
        {showStrip && (
          <span className="listingPictures__count" aria-hidden="true">
            {t('listing.detail.pictureCount', { current: String(active + 1), total: String(pictures.length) })}
          </span>
        )}
      </div>
      {current == null && (
        <Text type="tertiary" size="small" className="listing-detail__image-note">
          {t('listing.detail.noImageAlt')}
        </Text>
      )}

      {showStrip && (
        <div className="listingPictures__strip" role="group" aria-label={t('listing.detail.picturesLabel')}>
          {pictures.map((picture, index) => (
            <button
              type="button"
              key={picture.src}
              className={`listingPictures__thumb${index === active ? ' listingPictures__thumb--active' : ''}`}
              aria-label={t('listing.detail.showPicture', { number: String(index + 1) })}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            >
              <img
                src={picture.src}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = no_image;
                }}
              />
              {picture.floorPlan && <span className="listingPictures__badge">{t('listing.detail.floorPlan')}</span>}
            </button>
          ))}
        </div>
      )}

      {current != null && (
        <ImagePreview
          src={pictures.map((picture) => picture.src)}
          visible={viewerOpen}
          currentIndex={active}
          onChange={setActive}
          onVisibleChange={setViewerOpen}
          infinite={pictures.length > 1}
        />
      )}
    </section>
  );
}
