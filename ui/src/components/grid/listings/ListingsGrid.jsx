/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Link } from 'react-router';
import { IconBriefcase, IconMapPin, IconPaperclip } from '@douyinfe/semi-icons';
import no_image from '../../../assets/no_image.png';
import { formatEuroPrice } from '../../../services/price/priceService.js';
import * as timeService from '../../../services/time/timeService.js';
import StatusControl from '../../listings/StatusControl.jsx';
import AffordabilityChip from '../../listings/AffordabilityChip.jsx';
import PriceChangeBadge from '../../listings/PriceChangeBadge.jsx';
import PricePerSqmBadge from '../../listings/PricePerSqmBadge.jsx';
import ScamBadge from '../../listings/ScamBadge.jsx';
import WatchToggle from '../../listings/WatchToggle.jsx';
import ListingActions from '../../listings/ListingActions.jsx';
import CommuteBadge from '../../transit/CommuteBadge.jsx';

import './ListingsGrid.less';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
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
  return (
    <div className="listingsGrid__grid">
      {listings.map((item) => (
        // No role and no tabIndex. The card carried role="button" while containing seven
        // interactive children, which ARIA forbids and which a screen reader announces as a button
        // full of buttons. The click stays as a convenience for the mouse; the keyboard and the
        // accessibility tree use the title, which is a real link now. A click on that link is the
        // link's alone: letting it reach the card as well navigated twice - two history entries,
        // so Back landed on the same listing - and a Ctrl/Cmd-click opened the new tab *and* moved
        // this one.
        <div
          key={item.id}
          className="listingsGrid__card"
          onClick={(event) => {
            if (event.target.closest('a') == null) onNavigate(item.id);
          }}
        >
          <div className="listingsGrid__card__image-wrapper">
            {/* Decorative: the title says the same thing one line below, and alt={item.title} made
                a screen reader read every headline twice. */}
            <img
              src={item.image_url || no_image}
              alt=""
              onError={(e) => {
                e.target.src = no_image;
              }}
            />
            <ScamBadge listing={item} variant="onImage" />
            <WatchToggle listing={item} onWatch={onWatch} variant="overlay" />
            {!item.is_active && <span className="listingsGrid__card__inactive">{t('listings.cardInactive')}</span>}
          </div>

          <div className="listingsGrid__card__body">
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

            {item.price && (
              <div className="listingsGrid__card__price">
                <span className="listingsGrid__card__amount">{formatEuroPrice(item.price, locale)}</span>
                {/* Next to the price rather than on a line of its own: it is the same figure said
                    a second way, and reading the two together is the whole point. */}
                <PricePerSqmBadge listing={item} />
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
            {/* Only when there is something to say. A count of nothing on every card would be
                twenty lines of noise to surface the handful that carry documents - and those are
                also the listings that survive the retention purge, which is worth spotting. */}
            {item.attachmentCount > 0 && (
              <div className="listingsGrid__card__meta">
                <IconPaperclip />
                {item.attachmentCount === 1
                  ? t('listings.cardDocumentsOne')
                  : t('listings.cardDocuments', { count: item.attachmentCount })}
              </div>
            )}

            <div className="listingsGrid__card__foot">
              {/* The date the list is ordered by: the portal's own, where it states one, and the
                  moment Fredy found the listing where it does not. The detail page tells the two
                  apart. */}
              <span className="listingsGrid__card__date">
                {timeService.format(item.published_at ?? item.created_at, false, locale)}
              </span>
              {/* A state, not a command, so it sits with the listing's own facts rather than in
                  the action bar below. */}
              <span className="listingsGrid__card__status" onClick={(e) => e.stopPropagation()}>
                <StatusControl
                  status={item.status?.status ?? null}
                  compact
                  onChange={(next) => onStatusChange?.(item, next)}
                  onTriggerClick={(e) => e.stopPropagation()}
                />
              </span>
            </div>
          </div>

          {/* One place that stops the click, instead of one call per button inside. */}
          <div className="listingsGrid__card__actions" onClick={(e) => e.stopPropagation()}>
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
      ))}
    </div>
  );
};

export default ListingsGrid;
