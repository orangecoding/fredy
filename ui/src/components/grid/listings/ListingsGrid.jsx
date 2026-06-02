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
import { formatEuroPrice } from '../../../services/price/priceService.js';
import * as timeService from '../../../services/time/timeService.js';

import './ListingsGrid.less';

/**
 * @param {{ listings: object[], onWatch: Function, onNavigate: Function, onDelete: Function }} props
 */
const ListingsGrid = ({ listings, onWatch, onNavigate, onDelete }) => (
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
              <span>Inactive</span>
            </div>
          )}
          <button
            type="button"
            className="listingsGrid__card__star"
            onClick={(e) => onWatch(e, item)}
            aria-label={item.isWatched === 1 ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {item.isWatched === 1 ? <IconStar /> : <IconStarStroked />}
          </button>
        </div>

        <div className="listingsGrid__card__body">
          <div className="listingsGrid__card__title" title={item.title}>
            {item.title}
          </div>
          {item.price && (
            <div className="listingsGrid__card__price">
              <IconCart size="small" />
              {formatEuroPrice(item.price)}
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
          <div className="listingsGrid__card__provider">{timeService.format(item.created_at, false)}</div>
        </div>

        <div className="listingsGrid__card__actions" onClick={(e) => e.stopPropagation()}>
          <Tooltip content="Original Listing">
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
          <Tooltip content="View in Fredy">
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
          <Tooltip content="Remove">
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

export default ListingsGrid;
