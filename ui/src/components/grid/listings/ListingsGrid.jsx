/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconBriefcase,
  IconCart,
  IconDelete,
  IconMapPin,
  IconStar,
  IconStarStroked,
  IconEyeOpened,
  IconRefresh,
} from '@douyinfe/semi-icons';
import no_image from '../../../assets/no_image.png';
import { formatEuroPrice } from '../../../services/price/priceService.js';
import * as timeService from '../../../services/time/timeService.js';
import StatusControl from '../../listings/StatusControl.jsx';
import ExternalListingLink from '../../listings/ExternalListingLink.jsx';
import AffordabilityChip from '../../listings/AffordabilityChip.jsx';
import PriceChangeBadge from '../../listings/PriceChangeBadge.jsx';
import CommuteBadge from '../../transit/CommuteBadge.jsx';

import './ListingsGrid.less';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
 * @param {{ listings: object[], onWatch: Function, onNavigate: Function, onDelete: Function, onRestore?: Function, onReactivate?: Function, isHiddenView?: boolean, onStatusChange: Function }} props
 */
const ListingsGrid = ({
  listings,
  onWatch,
  onNavigate,
  onDelete,
  onRestore,
  onReactivate,
  isHiddenView = false,
  onStatusChange,
}) => {
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
                {formatEuroPrice(item.price, locale)}
                <AffordabilityChip verdict={item.affordabilityVerdict} dealType={item.dealType} />
                <PriceChangeBadge
                  price={item.price}
                  previousPrice={item.previous_price}
                  changedAt={item.price_changed_at}
                />
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
            {/* Compact on purpose: on a card the commute is a number you scan past twenty others,
                not something you read. The detail page shows the full picture. */}
            <CommuteBadge travelTimes={item.travelTimes} jobId={item.job_id} />
            <div className="listingsGrid__card__provider">{timeService.format(item.created_at, false, locale)}</div>
          </div>

          <div
            className="listingsGrid__card__actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <StatusControl
              status={item.status?.status ?? null}
              compact
              onChange={(next) => onStatusChange?.(item, next)}
              onTriggerClick={(e) => e.stopPropagation()}
            />
            <ExternalListingLink href={item.link} label={t('listings.tooltipOriginalListing')} />
            <Tooltip content={t('listings.tooltipViewInFredy')}>
              <Button
                size="small"
                icon={<IconEyeOpened />}
                style={{ color: 'var(--f-success)' }}
                theme="borderless"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(item.id);
                }}
              />
            </Tooltip>
            {/* Only offered where it can do something: the alive-checker marked this one gone, and
                the user is presumably looking at the ad that says otherwise. Not shown in the
                hidden view, where the row is soft-deleted and undelete is the action that matters. */}
            {!item.is_active && !isHiddenView && (
              <Tooltip content={t('listings.tooltipReactivate')}>
                <Button
                  size="small"
                  icon={<IconRefresh />}
                  style={{ color: 'var(--f-success)' }}
                  theme="borderless"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReactivate?.(item.id);
                  }}
                  aria-label={t('listings.tooltipReactivate')}
                />
              </Tooltip>
            )}
            {isHiddenView ? (
              <Tooltip content={t('listings.tooltipUndelete')}>
                <Button
                  size="small"
                  icon={
                    <span className="listingsGrid__strike" aria-hidden="true">
                      <IconDelete />
                    </span>
                  }
                  style={{ color: 'var(--f-success)' }}
                  theme="borderless"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.(item.id);
                  }}
                  aria-label={t('listings.tooltipUndelete')}
                />
              </Tooltip>
            ) : (
              <Tooltip content={t('listings.tooltipRemove')}>
                <Button
                  size="small"
                  icon={<IconDelete />}
                  style={{ color: 'var(--f-error)' }}
                  theme="borderless"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                />
              </Tooltip>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListingsGrid;
