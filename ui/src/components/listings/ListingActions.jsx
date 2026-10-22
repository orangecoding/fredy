/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Dropdown, Tooltip } from '@douyinfe/semi-ui-19';
import { IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import { IconCopy, IconMore } from '../icons/StrokeIcons.jsx';

import ExternalListingLink from './ExternalListingLink.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './ListingActions.less';

/**
 * Everything you can do to a listing from the overview, in one place for both views.
 *
 * The grid and the table used to build these buttons separately: seven controls, two
 * implementations, two sets of stopPropagation calls holding them together. Two implementations of
 * one meaning is how the views drift apart, and delete is exactly where drifting is expensive.
 *
 * Deliberately does not contain the status control. A status is a state, not a command, and the
 * detail page already separates the two - test/ui/listingActionHierarchy.test.js holds that rule.
 * In the table it buys something else on top: the status button is the only control here with a
 * variable width, and out of the action group it can no longer push the columns of its own row out
 * of line with every other row.
 *
 * No stopPropagation in this file. Both views wrap their action area in one element that stops the
 * click, which is the one place it belongs.
 *
 * @param {Object} props
 * @param {Object} props.listing A row as the listings API returns it.
 * @param {'card'|'row'} props.density Where the group sits: under a card, where the application
 *   button carries its name, or at the end of a table row, where it is an icon.
 * @param {boolean} [props.isHiddenView=false] The soft-deleted view.
 * @param {(listing: Object) => void} [props.onApplication]
 * @param {(id: string) => void} [props.onReactivate]
 * @param {(id: string) => void} [props.onRestore]
 * @param {(id: string) => void} props.onDelete
 * @returns {React.ReactElement}
 */
export default function ListingActions({
  listing,
  density,
  isHiddenView = false,
  onApplication,
  onReactivate,
  onRestore,
  onDelete,
}) {
  const t = useTranslation();

  // Only offered where it can do something: the alive-checker marked this one gone, and the user
  // is presumably looking at the ad that says otherwise. Not in the hidden view, where the row is
  // soft-deleted and undelete is the action that matters.
  const canReactivate = !listing.is_active && !isHiddenView;

  const overflow = (
    <Dropdown.Menu>
      {canReactivate && (
        <Dropdown.Item icon={<IconRefresh />} onClick={() => onReactivate?.(listing.id)}>
          {t('listings.tooltipReactivate')}
        </Dropdown.Item>
      )}
      {canReactivate && <Dropdown.Divider />}
      {isHiddenView ? (
        <Dropdown.Item icon={<IconRefresh />} onClick={() => onRestore?.(listing.id)}>
          {t('listings.tooltipUndelete')}
        </Dropdown.Item>
      ) : (
        <Dropdown.Item type="danger" icon={<IconDelete />} onClick={() => onDelete(listing.id)}>
          {t('listings.tooltipRemove')}
        </Dropdown.Item>
      )}
    </Dropdown.Menu>
  );

  // Not in the hidden view: the row is soft-deleted there, and writing to an agent about a listing
  // you have just thrown away is noise. On a card it is a button with its name, because applying
  // is what a listing is opened for, and as one icon among three it was looked for rather than
  // seen. A table row has no room for the word, so it keeps the icon with its name on hover.
  const applyLabel = t('listings.tooltipApplication');
  const apply = isHiddenView ? null : density === 'card' ? (
    <button type="button" className="listingActions__apply" onClick={() => onApplication?.(listing)}>
      <IconCopy />
      <span className="listingActions__applyLabel">{applyLabel}</span>
    </button>
  ) : (
    <Tooltip content={applyLabel}>
      <button
        type="button"
        className="listingActions__button"
        aria-label={applyLabel}
        onClick={() => onApplication?.(listing)}
      >
        <IconCopy />
      </button>
    </Tooltip>
  );

  return (
    <div className={`listingActions listingActions--${density}`} role="group" aria-label={t('listings.actionsLabel')}>
      {apply}

      <ExternalListingLink
        href={listing.link}
        label={t('listings.tooltipOriginalListing')}
        className="listingActions__button"
      />

      {/* clickToHide, because Semi's Dropdown does not close itself: without it the menu stayed
          open on top of the deletion dialog it had just opened, and the only way out was a click
          somewhere else. Same fix, same reason as JobActions. */}
      <Dropdown
        trigger="click"
        position="bottomRight"
        clickToHide
        className="listingActions__menuPopup"
        render={overflow}
        stopPropagation
      >
        <button type="button" className="listingActions__button" aria-label={t('listings.moreActions')}>
          <IconMore />
        </button>
      </Dropdown>
    </div>
  );
}

ListingActions.displayName = 'ListingActions';
