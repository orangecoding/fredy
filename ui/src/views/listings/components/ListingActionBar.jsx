/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Dropdown, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconChevronLeft,
  IconCopy,
  IconDelete,
  IconLink,
  IconMore,
  IconRefresh,
  IconStar,
  IconStarStroked,
} from '@douyinfe/semi-icons';

import { providerName } from '../listingFacts.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import './ListingActionBar.less';

/**
 * The one row of controls the detail page acts through.
 *
 * Every button on this page used to carry the same visual weight, so "copy application letter" and
 * "delete listing" sat in the same register and, on a narrow viewport, at the same width. The bar
 * now has exactly one solid button - writing the letter, which is what the reader came to do - a
 * pair of outlined secondaries either side of it, and the two destructive actions folded into an
 * overflow menu where a wrong click costs a second step rather than a listing.
 *
 * On phones the bar leaves the top of the page and fixes itself to the bottom edge, where the
 * primary action takes the full width: the thumb is there and the header is not.
 *
 * @param {Object} props
 * @param {Object} props.listing - The row being shown.
 * @param {() => void} props.onBack
 * @param {() => void} props.onWatch
 * @param {() => void} props.onApply - Opens the application letter dialog.
 * @param {() => void} props.onDelete
 * @param {() => void} props.onReactivate
 * @returns {React.ReactElement}
 */
export default function ListingActionBar({ listing, onBack, onWatch, onApply, onDelete, onReactivate }) {
  const t = useTranslation();
  const watched = listing?.isWatched === 1;
  const watchLabel = watched ? t('listing.detail.watched') : t('listing.detail.watch');
  // Naming the portal turns "open listing" from a promise into a destination, which matters for a
  // link that leaves the app.
  const openLabel = listing?.provider
    ? t('listing.detail.openInPortal', { portal: providerName(listing.provider) })
    : t('listing.detail.openListing');

  const overflow = (
    <Dropdown.Menu>
      {listing?.is_active === 0 && (
        <Dropdown.Item icon={<IconRefresh />} onClick={onReactivate}>
          {t('listing.detail.reactivate')}
        </Dropdown.Item>
      )}
      <Dropdown.Item icon={<IconDelete />} type="danger" onClick={onDelete}>
        {t('listing.detail.delete')}
      </Dropdown.Item>
    </Dropdown.Menu>
  );

  return (
    <div className="listing-actionbar">
      <Button
        className="listing-actionbar__back"
        icon={<IconChevronLeft />}
        onClick={onBack}
        theme="borderless"
        aria-label={t('listing.detail.back')}
      >
        <span className="listing-actionbar__back-label">{t('listing.detail.back')}</span>
      </Button>

      <div className="listing-actionbar__spacer" />

      <Tooltip content={watchLabel} position="bottom">
        <Button
          icon={watched ? <IconStar /> : <IconStarStroked />}
          onClick={onWatch}
          theme="borderless"
          aria-label={watchLabel}
          aria-pressed={watched}
          className={`listing-actionbar__watch${watched ? ' listing-actionbar__watch--active' : ''}`}
        />
      </Tooltip>

      <a
        href={listing?.link}
        target="_blank"
        rel="noopener noreferrer"
        className="listing-actionbar__open"
        title={openLabel}
      >
        <IconLink />
        <span className="listing-actionbar__open-label">{openLabel}</span>
      </a>

      {/* clickToHide, because Semi's Dropdown does not close itself: without it the menu stayed
          open on top of the deletion dialog it had just opened, and the only way out was a click
          somewhere else. Same fix, same reason as ListingActions, JobActions and MapPopupActions. */}
      <Dropdown trigger="click" position="bottomRight" clickToHide render={overflow}>
        <Button
          icon={<IconMore />}
          theme="borderless"
          aria-label={t('listing.detail.moreActions')}
          className="listing-actionbar__more"
        />
      </Dropdown>

      <span className="listing-actionbar__divider" aria-hidden="true" />

      <Button className="listing-actionbar__primary" icon={<IconCopy />} onClick={onApply} theme="solid" type="primary">
        {t('listing.application.action')}
      </Button>
    </div>
  );
}

ListingActionBar.displayName = 'ListingActionBar';
