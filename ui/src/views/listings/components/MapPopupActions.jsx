/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Dropdown } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEyeOpened, IconLink, IconMore } from '@douyinfe/semi-icons';

import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './MapPopupActions.less';

/**
 * What you can do with the listing a map popup is showing.
 *
 * React inside a popup that is otherwise a string of markup. The popup has to be a string because
 * MapLibre takes DOM, not a component tree - but `mountPopupNode()` already mounts the nearby-stops
 * block into it the same way, so this is the mechanism the file already uses rather than a new one.
 *
 * It replaces two globals. The old buttons reached `viewDetails` and `deleteListing`, which the map
 * view installed on `window` in a `useEffect`, because an inline click handler in a string of
 * markup can only reach globals. Nothing installs anything on `window` after this.
 *
 * Three actions, one colour. There used to be three filled 32px blocks, two of them red: the left
 * one opened the advert on the portal, the right one deleted the listing.
 *
 * Navigation arrives as a prop rather than from the router's own hook: `mountPopupNode` creates a
 * React root of its own, outside the router, where that hook would throw.
 *
 * @param {Object} props
 * @param {Object} props.listing
 * @param {(id: string) => void} props.onDelete
 * @param {(id: string) => void} props.onNavigate
 * @returns {React.ReactElement}
 */
export default function MapPopupActions({ listing, onDelete, onNavigate }) {
  const t = useTranslation();

  const overflow = (
    <Dropdown.Menu>
      <Dropdown.Item type="danger" icon={<IconDelete />} onClick={() => onDelete(listing.id)}>
        {t('map.popupRemove')}
      </Dropdown.Item>
    </Dropdown.Menu>
  );

  return (
    <div className="mapPopupActions">
      <Button
        className="mapPopupActions__details"
        theme="outline"
        size="small"
        icon={<IconEyeOpened />}
        onClick={() => onNavigate(listing.id)}
      >
        {t('map.popupViewDetails')}
      </Button>

      {listing.link && (
        <a
          className="mapPopupActions__open"
          href={listing.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('listings.tooltipOriginalListing')}
          title={t('listings.tooltipOriginalListing')}
        >
          <IconLink />
        </a>
      )}

      {/* clickToHide, because Semi's Dropdown does not close itself: without it the menu stayed
          open on top of the deletion dialog it had just opened, and the only way out was a click
          somewhere else. Same fix, same reason as ListingActions and JobActions - this is the
          third menu of this shape in the app, and all three need the flag. */}
      <Dropdown trigger="click" position="bottomRight" clickToHide render={overflow} stopPropagation>
        <Button
          className="mapPopupActions__more"
          size="small"
          icon={<IconMore />}
          aria-label={t('listings.moreActions')}
        />
      </Dropdown>
    </div>
  );
}

MapPopupActions.displayName = 'MapPopupActions';
