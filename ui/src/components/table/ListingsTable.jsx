/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconBriefcase,
  IconDelete,
  IconLink,
  IconMapPin,
  IconStar,
  IconStarStroked,
  IconEyeOpened,
} from '@douyinfe/semi-icons';
import no_image from '../../assets/no_image.png';
import { formatEuroPrice } from '../../services/price/priceService.js';
import * as timeService from '../../services/time/timeService.js';
import StatusControl from '../listings/StatusControl.jsx';

import './ListingsTable.less';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

/**
 * @param {{ listings: object[], onWatch: Function, onNavigate: Function, onDelete: Function, onStatusChange: Function }} props
 */
const ListingsTable = ({ listings, onWatch, onNavigate, onDelete, onStatusChange }) => {
  const t = useTranslation();
  const locale = useLocale();
  return (
    <div className="listingsTable">
      {listings.map((item) => (
        <div
          key={item.id}
          className={`listingsTable__row${!item.is_active ? ' listingsTable__row--inactive' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onNavigate(item.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onNavigate(item.id);
          }}
        >
          <div className="listingsTable__row__thumb">
            <img
              src={item.image_url || no_image}
              alt={item.title}
              onError={(e) => {
                e.target.src = no_image;
              }}
            />
          </div>

          <div className="listingsTable__row__title" title={item.title}>
            {item.title}
          </div>

          <div className="listingsTable__row__price">
            {item.price ? formatEuroPrice(item.price) : <span className="listingsTable__row__empty">---</span>}
          </div>

          <div className="listingsTable__row__address">
            {item.address ? (
              <>
                <IconMapPin size="small" />
                {item.address}
              </>
            ) : (
              <span className="listingsTable__row__empty">---</span>
            )}
          </div>

          <div className="listingsTable__row__meta">
            <IconBriefcase size="small" />
            {item.provider}
          </div>

          <div className="listingsTable__row__date">{timeService.format(item.created_at, false, locale)}</div>

          <div className="listingsTable__row__actions" onClick={(e) => e.stopPropagation()}>
            <StatusControl
              status={item.status?.status ?? null}
              compact
              onChange={(next) => onStatusChange?.(item, next)}
              onTriggerClick={(e) => e.stopPropagation()}
            />
            <Tooltip
              content={
                item.isWatched === 1 ? t('listings.tooltipRemoveFromWatchlist') : t('listings.tooltipAddToWatchlist')
              }
            >
              <button
                type="button"
                className="listingsTable__row__star"
                onClick={(e) => onWatch(e, item)}
                aria-label={
                  item.isWatched === 1 ? t('listings.tooltipRemoveFromWatchlist') : t('listings.tooltipAddToWatchlist')
                }
              >
                {item.isWatched === 1 ? <IconStar /> : <IconStarStroked />}
              </button>
            </Tooltip>
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

export default ListingsTable;
