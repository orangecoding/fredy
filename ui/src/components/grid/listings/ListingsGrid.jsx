/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Link } from 'react-router';
import { IconPaperclip } from '@douyinfe/semi-icons';
import { listingPictureSrc } from '../../../services/listings/listingPictures.js';
import { formatEuroPrice } from '../../../services/price/priceService.js';
import { formatDecimal } from '../../../services/number/numberService.js';
import * as timeService from '../../../services/time/timeService.js';
import { relativeTime } from '../../../services/time/relativeTime.js';
import { useSelector } from '../../../services/state/store.js';
import ListingPhoto from '../../listings/ListingPhoto.jsx';
import StatusControl from '../../listings/StatusControl.jsx';
import AffordabilityChip from '../../listings/AffordabilityChip.jsx';
import { rentIncludesCharges } from '../../../services/finance/rentBasis.js';
import PriceChangeBadge from '../../listings/PriceChangeBadge.jsx';
import PricePerSqmBadge from '../../listings/PricePerSqmBadge.jsx';
import ScamBadge from '../../listings/ScamBadge.jsx';
import WatchToggle from '../../listings/WatchToggle.jsx';
import ListingActions from '../../listings/ListingActions.jsx';
import CommuteBadge from '../../transit/CommuteBadge.jsx';

import './ListingsGrid.less';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
 * Address, rooms and living space of one listing, as one line. Whatever is missing is left out
 * rather than filled with a dash.
 *
 * @param {Object} item
 * @param {string} locale
 * @param {(key: string, params?: Object) => string} t
 * @returns {string}
 */
function whereLine(item, locale, t) {
  return [
    item.address,
    item.rooms == null ? null : t('listing.detail.fieldRoomsValue', { count: formatDecimal(item.rooms, locale) }),
    item.size == null ? null : `${formatDecimal(item.size, locale)} m²`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The listings as photographs, three to a row on a desktop.
 *
 * A card is not a box: the photograph, the facts under it, and a footer of tools behind a hairline.
 * Twenty boxed cards made the page a wall of frames; spaced photographs read as what they are.
 *
 * The age sits on the photo, the first thing someone deciding whether to call cares about; the
 * exact date is one hover away. An inactive listing says so in the same place, dimmed.
 *
 * @param {{ listings: object[], onWatch: Function, onNavigate: Function, onDelete: Function, onRestore?: Function, onReactivate?: Function, isHiddenView?: boolean, onStatusChange: Function, onApplication?: Function }} props
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
  onApplication,
}) => {
  const t = useTranslation();
  const locale = useLocale();
  const providers = useSelector((state) => state.provider);
  const providerName = (id) => (Array.isArray(providers) ? providers.find((p) => p.id === id)?.name : null) ?? id;

  return (
    <div className="listingsGrid__grid">
      {listings.map((item) => {
        const listedAt = item.published_at ?? item.created_at;
        const where = whereLine(item, locale, t);
        return (
          // No role and no tabIndex. The card carried role="button" while containing seven
          // interactive children, which ARIA forbids and which a screen reader announces as a button
          // full of buttons. The click stays as a convenience for the mouse; the keyboard and the
          // accessibility tree use the title, which is a real link. A click on that link is the
          // link's alone: letting it reach the card as well navigated twice.
          <div
            key={item.id}
            className={`listingsGrid__card${item.is_active ? '' : ' listingsGrid__card--inactive'}`}
            onClick={(event) => {
              if (event.target.closest('a') == null) onNavigate(item.id);
            }}
          >
            <div className="listingsGrid__card__media">
              <ListingPhoto src={listingPictureSrc(item)} className="listingsGrid__card__photo" />
              {item.is_active ? (
                <span className="listingsGrid__card__age" title={timeService.format(listedAt, true, locale)}>
                  {relativeTime(listedAt, t)}
                </span>
              ) : (
                <span className="listingsGrid__card__age">{t('listings.cardInactive')}</span>
              )}
              <ScamBadge listing={item} variant="onImage" />
              <WatchToggle listing={item} onWatch={onWatch} variant="overlay" />
            </div>

            <div className="listingsGrid__card__body">
              {item.price && (
                <div className="listingsGrid__card__price">
                  <span className="listingsGrid__card__amount">{formatEuroPrice(item.price, locale)}</span>
                  {/* Next to the price rather than on a line of its own: it is the same figure said
                      a second way, and reading the two together is the whole point. */}
                  <PricePerSqmBadge listing={item} />
                  <AffordabilityChip
                    verdict={item.affordabilityVerdict}
                    dealType={item.dealType}
                    chargesIncluded={rentIncludesCharges(item)}
                  />
                  <PriceChangeBadge
                    price={item.price}
                    previousPrice={item.previous_price}
                    changedAt={item.price_changed_at}
                  />
                </div>
              )}

              {/* In the hidden view onNavigate refuses to go anywhere, so the title is not a link
                  there either - a link that leads nowhere is worse than plain text. */}
              {isHiddenView ? (
                <span className="listingsGrid__card__title" title={item.title}>
                  {item.title}
                </span>
              ) : (
                <Link className="listingsGrid__card__title" to={`/listings/listing/${item.id}`} title={item.title}>
                  {item.title}
                </Link>
              )}

              {where && <span className="listingsGrid__card__meta">{where}</span>}
              {/* Compact on purpose: on a card the commute is a number you scan past twenty others,
                  not something you read. The detail page shows the full picture. */}
              <CommuteBadge travelTimes={item.travelTimes} jobId={item.job_id} />
              {/* Only when there is something to say. Listings that carry documents also survive the
                  retention purge, which is worth spotting. */}
              {item.attachmentCount > 0 && (
                <span className="listingsGrid__card__meta">
                  <IconPaperclip />
                  {item.attachmentCount === 1
                    ? t('listings.cardDocumentsOne')
                    : t('listings.cardDocuments', { count: item.attachmentCount })}
                </span>
              )}
            </div>

            {/* One place that stops the click, instead of one call per control inside. */}
            <div className="listingsGrid__card__foot" onClick={(e) => e.stopPropagation()}>
              <span className="listingsGrid__card__provider">{providerName(item.provider)}</span>
              {/* A state, not a command, so it stands apart from the three tools after it. */}
              <StatusControl
                status={item.status?.status ?? null}
                compact
                onChange={(next) => onStatusChange?.(item, next)}
                onTriggerClick={(e) => e.stopPropagation()}
              />
              <ListingActions
                listing={item}
                density="card"
                isHiddenView={isHiddenView}
                onApplication={onApplication}
                onReactivate={onReactivate}
                onRestore={onRestore}
                onDelete={onDelete}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ListingsGrid;
