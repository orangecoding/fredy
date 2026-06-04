/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconBriefcase,
  IconCart,
  IconDelete,
  IconLink,
  IconMapPin,
  IconStar,
  IconStarStroked,
  IconEyeOpened,
} from '@douyinfe/semi-icons';
import no_image from '../../../assets/no_image.png';
import * as timeService from '../../../services/time/timeService.js';
import StatusControl from '../../listings/StatusControl.jsx';

import './ListingsGrid.less';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
 * @param {{ listings: object[], onWatch: Function, onNavigate: Function, onDelete: Function, onStatusChange: Function }} props
 */
const ListingsGrid = ({ listings, onWatch, onNavigate, onDelete, onStatusChange }) => {
  const t = useTranslation();
  const locale = useLocale();
  return (
    <div className="listingsGrid__grid">
      {listings.map((item) => (
        <div
          key={item.id}
          className="listingsGrid__card"
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onClick={() => onNavigate(item.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onNavigate(item.id);
          }}
        >
          <div className="listingsGrid__card__image-wrapper">
            <img
              src={item.image_url || no_image}
              alt={item.title}
              onError={(e) => {
                e.target.src = no_image;
              }}
            />
            {!item.is_active && (
              <div className="listingsGrid__card__inactive-watermark">
                <span>{t('listings.cardInactive')}</span>
              </div>
            )}
            <Tooltip
              content={
                item.isWatched === 1 ? t('listings.tooltipRemoveFromWatchlist') : t('listings.tooltipAddToWatchlist')
              }
            >
              <button
                type="button"
                className="listingsGrid__card__star"
                onClick={(e) => onWatch(e, item)}
                aria-label={
                  item.isWatched === 1 ? t('listings.tooltipRemoveFromWatchlist') : t('listings.tooltipAddToWatchlist')
                }
              >
                {item.isWatched === 1 ? <IconStar /> : <IconStarStroked />}
              </button>
            </Tooltip>
          </div>

          <div className="listingsGrid__card__body">
            <div className="listingsGrid__card__title" title={item.title}>
              {item.title}
            </div>
            {item.price && (
              <div className="listingsGrid__card__price">
                <IconCart size="small" />
                {item.price}
              </div>
            )}
            {item.address && (
              <div className="listingsGrid__card__meta">
                <IconMapPin />
                {item.address}
              </div>
            )}
            <div className="listingsGrid__card__meta">
              <IconBriefcase />
              {item.provider}
            </div>
            <div className="listingsGrid__card__provider">{timeService.format(item.created_at, false, locale)}</div>
          </div>

          <div className="listingsGrid__card__actions" onClick={(e) => e.stopPropagation()}>
            <StatusControl
              status={item.status?.status ?? null}
              compact
              onChange={(next) => onStatusChange?.(item, next)}
              onTriggerClick={(e) => e.stopPropagation()}
            />
            <Tooltip content={t('listings.tooltipOriginalListing')}>
              <Button
                size="small"
                icon={<IconLink />}
                style={{ color: '#60a5fa' }}
                theme="borderless"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(item.link, '_blank');
                }}
              />
            </Tooltip>
            <Tooltip content={t('listings.tooltipViewInFredy')}>
              <Button
                size="small"
                icon={<IconEyeOpened />}
                style={{ color: '#34d399' }}
                theme="borderless"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(item.id);
                }}
              />
            </Tooltip>
            <Tooltip content={t('listings.tooltipRemove')}>
              <Button
                size="small"
                icon={<IconDelete />}
                style={{ color: '#fb7185' }}
                theme="borderless"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
              />
            </Tooltip>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListingsGrid;
