/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Link } from 'react-router';
import { IconMapPin } from '@douyinfe/semi-icons';
import no_image from '../../assets/no_image.png';
import { formatEuroPrice } from '../../services/price/priceService.js';
import * as timeService from '../../services/time/timeService.js';
import StatusControl from '../listings/StatusControl.jsx';
import AffordabilityChip from '../listings/AffordabilityChip.jsx';
import PriceChangeBadge from '../listings/PriceChangeBadge.jsx';
import PricePerSqmBadge from '../listings/PricePerSqmBadge.jsx';
import ScamBadge from '../listings/ScamBadge.jsx';
import WatchToggle from '../listings/WatchToggle.jsx';
import ListingActions from '../listings/ListingActions.jsx';
import CommuteBadge from '../transit/CommuteBadge.jsx';

import './ListingsTable.less';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

/**
 * @param {{ listings: object[], onWatch: Function, onNavigate: Function, onDelete: Function, onRestore?: Function, onReactivate?: Function, isHiddenView?: boolean, onStatusChange: Function, onApplication?: Function }} props
 */
const ListingsTable = ({
  listings,
  onWatch,
  onNavigate,
  onDelete,
  onRestore,
  onReactivate,
  isHiddenView = false,
  onStatusChange,
  onApplication,
}) => {
  const t = useTranslation();
  const locale = useLocale();
  return (
    <div className="listingsTable">
      {/* The rows carried four unlabelled values side by side while the roomier grid spelled each
          of them out. The header uses the same column variable as the row, so the two cannot end
          up describing different things. */}
      {/* Only over rows: with none, the titles stood under the "no results" illustration. */}
      {listings.length > 0 && (
        <div className="listingsTable__head" aria-hidden="true">
          <span />
          <span>{t('listings.columnListing')}</span>
          <span className="listingsTable__head__right">{t('listings.columnPrice')}</span>
          <span>{t('listings.columnAddress')}</span>
          <span>{t('listings.columnProvider')}</span>
          <span>{t('listings.columnDate')}</span>
          <span>{t('listings.columnStatus')}</span>
          <span />
        </div>
      )}

      {listings.map((item) => (
        // No role and no tabIndex, same as the card: the row used to be a button containing seven
        // buttons. The title carries the keyboard and the accessibility tree, and a click on it is
        // the link's alone, for the reason the card gives.
        <div
          key={item.id}
          className="listingsTable__row"
          onClick={(event) => {
            if (event.target.closest('a') == null) onNavigate(item.id);
          }}
        >
          <div className="listingsTable__row__thumb">
            <img
              src={item.image_url || no_image}
              alt=""
              onError={(e) => {
                e.target.src = no_image;
              }}
            />
          </div>

          <div className="listingsTable__row__title">
            {isHiddenView ? (
              <span className="listingsTable__row__title-text" title={item.title}>
                {item.title}
              </span>
            ) : (
              <Link className="listingsTable__row__title-text" to={`/listings/listing/${item.id}`} title={item.title}>
                {item.title}
              </Link>
            )}
            {/* Under the headline rather than in front of it. In front, the badge had to give up
                its word to leave room for the title, and a warning without a word is a shape. */}
            {(!item.is_active || item.scam_signals?.length > 0 || item.scam_override != null) && (
              <div className="listingsTable__row__flags">
                <ScamBadge listing={item} />
                {!item.is_active && <span className="listingsTable__row__inactive">{t('listings.cardInactive')}</span>}
              </div>
            )}
          </div>

          <div className="listingsTable__row__price">
            {item.price ? (
              <>
                <span className="listingsTable__row__amount">{formatEuroPrice(item.price, locale)}</span>
                <span className="listingsTable__row__perSqm">
                  <PricePerSqmBadge listing={item} />
                  <AffordabilityChip verdict={item.affordabilityVerdict} dealType={item.dealType} />
                  <PriceChangeBadge
                    price={item.price}
                    previousPrice={item.previous_price}
                    changedAt={item.price_changed_at}
                  />
                </span>
              </>
            ) : (
              <span className="listingsTable__row__empty">---</span>
            )}
          </div>

          <div className="listingsTable__row__address">
            {item.address ? (
              <span className="listingsTable__row__address-text">
                <IconMapPin size="small" />
                {item.address}
              </span>
            ) : (
              <span className="listingsTable__row__empty">---</span>
            )}
            {/* Under the address rather than in a column of its own: it is the same question, and a
                column would be empty for every listing that has not been routed yet. */}
            <CommuteBadge travelTimes={item.travelTimes} jobId={item.job_id} />
          </div>

          <div className="listingsTable__row__meta">{item.provider}</div>

          {/* The portal's own publication date, falling back to the day Fredy first saw the
              advert - the same expression the grid renders and the same one the default sort
              orders by, so the column cannot disagree with the order it is sorted in. */}
          <div className="listingsTable__row__date">
            {timeService.format(item.published_at ?? item.created_at, false, locale)}
          </div>

          {/* Its own column. A state is not a command, and it is the only control here whose width
              depends on its value - inside the action group it dragged the whole row's columns out
              of line with every other row. */}
          <div className="listingsTable__row__status" onClick={(e) => e.stopPropagation()}>
            <StatusControl
              status={item.status?.status ?? null}
              compact
              onChange={(next) => onStatusChange?.(item, next)}
              onTriggerClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* One place that stops the click, instead of one call per button inside. */}
          <div className="listingsTable__row__actions" onClick={(e) => e.stopPropagation()}>
            <WatchToggle listing={item} onWatch={onWatch} variant="inline" />
            <ListingActions
              listing={item}
              density="row"
              isHiddenView={isHiddenView}
              onApplication={onApplication}
              onReactivate={onReactivate}
              onRestore={onRestore}
              onDelete={onDelete}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ListingsTable;
