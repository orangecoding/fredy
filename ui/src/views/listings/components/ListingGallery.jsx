/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Image, Modal, Typography } from '@douyinfe/semi-ui-19';
import { IconChevronLeft, IconChevronRight } from '@douyinfe/semi-icons';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import no_image from '../../../assets/no_image.png';
import './ListingGallery.less';

const { Text, Title } = Typography;

/**
 * Exposé photo carousel for the listing detail view.
 *
 * Small mode is a stage with side arrows, a counter and the filmstrip underneath;
 * clicking the stage (or any thumb) opens the fullscreen modal with bigger arrows and
 * keyboard navigation. Photos come from the local gallery the "enrich on click" fetch
 * downloaded (`/api/listings/:id/images/:index`), never from remote URLs.
 *
 * Always rendered with the same structure so the block never pops the layout: before the
 * exposé delivers photos the stage shows the remote cover (or a placeholder), with arrows
 * and counter joining in once there is more than one photo to move between. Pulse tiles
 * while the exposé is still coming, a quiet note when it came back with no photos.
 *
 * @param {Object} props
 * @param {string} props.listingId - DB id used to build the per-index image URLs.
 * @param {string[]} props.files - Local gallery paths; empty until the exposé delivers them.
 * @param {boolean} props.pending - True while the exposé may still be on its way.
 * @param {string|null} [props.coverUrl] - Remote cover shown in the stage until local photos arrive.
 */
export default function ListingGallery({ listingId, files, pending, coverUrl }) {
  const t = useTranslation();
  const total = Array.isArray(files) ? files.length : 0;
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // The gallery can shrink (a re-fetch replacing it) while an index is selected.
  const current = total === 0 ? 0 : Math.min(index, total - 1);
  const go = useCallback(
    (delta) => {
      if (total === 0) return;
      setIndex((((current + delta) % total) + total) % total);
    },
    [current, total],
  );

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (event) => {
      if (event.key === 'ArrowLeft') go(-1);
      else if (event.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, go]);

  const imageUrl = (i) => `/api/listings/${listingId}/images/${i}`;

  return (
    <div className="listing-gallery">
      <Title heading={6} className="listing-gallery__title">
        {total > 0 ? t('listing.detail.galleryTitle', { count: total }) : t('listing.detail.photosTitle')}
      </Title>

      <div className="listing-gallery__stage">
        {total > 0 && (
          <Button
            className="listing-gallery__arrow listing-gallery__arrow--left"
            icon={<IconChevronLeft />}
            aria-label={t('listing.detail.galleryPrev')}
            onClick={() => go(-1)}
          />
        )}
        <Image
          src={total > 0 ? imageUrl(current) : coverUrl || no_image}
          fallback={<img src={no_image} alt={t('listing.detail.noImageAlt')} />}
          className="listing-gallery__stage-image"
          preview={false}
          onClick={() => setFullscreen(true)}
        />
        {total > 0 && (
          <Button
            className="listing-gallery__arrow listing-gallery__arrow--right"
            icon={<IconChevronRight />}
            aria-label={t('listing.detail.galleryNext')}
            onClick={() => go(1)}
          />
        )}
        {total > 0 && (
          <span className="listing-gallery__counter">
            {current + 1} / {total}
          </span>
        )}
      </div>

      <div className="listing-detail__gallery-strip">
        {Array.isArray(files) &&
          files.map((_, i) => (
            <Image
              key={i}
              src={imageUrl(i)}
              fallback={<img src={no_image} alt={t('listing.detail.noImageAlt')} />}
              className={`listing-detail__gallery-image${i === current && total > 0 ? ' listing-detail__gallery-image--active' : ''}`}
              width={120}
              height={90}
              preview={false}
              onClick={() => {
                setIndex(i);
                if (fullscreen) return;
              }}
            />
          ))}
        {pending &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={`placeholder-${i}`} className="listing-detail__gallery-placeholder" aria-hidden="true" />
          ))}
        {!pending && total === 0 && (
          <Text type="tertiary" size="small">
            {t('listing.detail.galleryEmpty')}
          </Text>
        )}
      </div>

      <Modal
        visible={fullscreen}
        footer={null}
        centered
        width="90vw"
        className="listing-gallery__modal"
        onCancel={() => setFullscreen(false)}
      >
        {total > 0 ? (
          <div className="listing-gallery__fullscreen">
            <Button
              className="listing-gallery__arrow listing-gallery__arrow--left listing-gallery__arrow--large"
              icon={<IconChevronLeft />}
              aria-label={t('listing.detail.galleryPrev')}
              onClick={() => go(-1)}
            />
            <img
              src={imageUrl(current)}
              alt={`${current + 1} / ${total}`}
              className="listing-gallery__fullscreen-image"
            />
            <Button
              className="listing-gallery__arrow listing-gallery__arrow--right listing-gallery__arrow--large"
              icon={<IconChevronRight />}
              aria-label={t('listing.detail.galleryNext')}
              onClick={() => go(1)}
            />
            <span className="listing-gallery__counter">
              {current + 1} / {total}
            </span>
          </div>
        ) : (
          <img
            src={coverUrl || no_image}
            alt={t('listing.detail.noImageAlt')}
            className="listing-gallery__fullscreen-image"
          />
        )}
      </Modal>
    </div>
  );
}
