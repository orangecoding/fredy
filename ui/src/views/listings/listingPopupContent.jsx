/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { renderToString } from 'react-dom/server';
import { IconChevronLeft, IconChevronRight } from '@douyinfe/semi-icons';
import no_image from '../../assets/no_image.png';
import { availableModes, formatMinutes, hasAnyTime } from '../../components/transit/travelTimeFormat.js';
import { formatEuroPrice } from '../../services/price/priceService.js';
import { formatDecimal } from '../../services/number/numberService.js';
import { mountPopupNode } from '../../components/map/popupContent.jsx';
import MapPopupActions from './components/MapPopupActions.jsx';

/**
 * Builds the DOM for a listing popup on the map.
 *
 * One popup can hold several listings: everything geocoded to the same spot - a whole house, or a
 * town whose listings only resolved to its centre - shares a single pin, and the popup pages
 * through them. The nearby-stops block is the same for all of them, so it sits outside the paged
 * part and is mounted once by the caller.
 *
 * The action bar is React, mounted into this markup through `mountPopupNode()` - the same way the
 * nearby-stops block is. That is what let the two globals go that the map view used to install on
 * `window`: an inline click handler inside a string of markup can only reach a global, whereas a
 * mounted component takes callbacks.
 *
 * @param {Object} params
 * @param {object[]} params.listings - The listings at this position, at least one.
 * @param {(key: string, vars?: Record<string, string|number>) => string} params.t
 * @param {string} [params.locale] - BCP 47 locale for the price. This markup is built outside
 * React, so the view hands its `useLocale()` value down.
 * @param {string} params.language - Active language code, for the translation provider the mounted
 * action bar needs: it sits in a React root of its own and inherits no context from the app.
 * @param {(id: string) => void} params.onDelete - Asked for the removal of a listing.
 * @param {(id: string) => void} params.onNavigate - Asked to open a listing's detail page. A
 * callback rather than `useNavigate()`, which would throw outside the router.
 * @param {string|null} [params.initialId] - Which of the group to show first. For reopening the
 * popup the URL says was open, on the page it was left on; an id that is not in this group falls
 * back to the first, so a stale address cannot leave the popup blank.
 * @param {(id: string) => void} [params.onPageChange] - Called after the popup switched to another
 * listing, with its id. That changes the popup's height, and it changes which listing the address
 * bar has to name.
 * @returns {{element: HTMLElement, transitMount: HTMLElement, unmount: () => void,
 * currentId: () => string}} The popup content, the empty node the nearby stops are to be rendered
 * into, the teardown of the action bar, and which listing is on screen right now.
 */
export function createListingPopupContent({
  listings,
  t,
  locale,
  language,
  onDelete,
  onNavigate,
  initialId = null,
  onPageChange,
}) {
  const element = document.createElement('div');
  element.className = 'map-popup-content';
  /*
   * Focusable, but never in the tab order by itself.
   *
   * This is where the caller sends focus when the popup opens, instead of letting MapLibre focus
   * the first link inside it - which since the redesign is the title, and a heading wearing a
   * focus ring on every open reads as a stray border. Focus has to go *somewhere* in here though:
   * a popup is appended after every marker in the DOM, so from the marker that opened it the tab
   * order runs through all the other markers first, and without this the contents would be out of
   * keyboard reach entirely. Landing on the container puts the title and the actions one Tab away.
   */
  element.tabIndex = -1;

  const body = document.createElement('div');
  element.appendChild(body);

  const transit = document.createElement('div');
  transit.className = 'map-popup-content__transit';
  transit.innerHTML = `<strong>${t('transit.nearbyTitle')}</strong>
    <div class="map-popup-content__transit-mount"></div>`;
  element.appendChild(transit);

  // Where the group opens. `findIndex` returns -1 for an id that is not in it, which the max turns
  // back into the first listing.
  let index = Math.max(
    0,
    listings.findIndex((listing) => listing.id === initialId),
  );
  // The action bar is React mounted into the paged part, and paging replaces that part's markup.
  // So the previous root has to be unmounted before the next one is created, or every page turn
  // leaks one.
  let unmountActions = null;

  const render = () => {
    unmountActions?.();
    unmountActions = null;

    body.innerHTML = renderListingBody(listings[index], index, listings.length, t, locale);

    const step = (delta) => {
      index = (index + delta + listings.length) % listings.length;
      render();
      onPageChange?.(listings[index].id);
    };
    body.querySelector('.js-popup-prev')?.addEventListener('click', () => step(-1));
    body.querySelector('.js-popup-next')?.addEventListener('click', () => step(1));

    const actions = body.querySelector('.map-popup-content__actions');
    if (actions) {
      unmountActions = mountPopupNode(
        actions,
        <MapPopupActions listing={listings[index]} onDelete={onDelete} onNavigate={onNavigate} />,
        language,
      );
    }
  };

  render();

  return {
    element,
    transitMount: transit.querySelector('.map-popup-content__transit-mount'),
    /** Tears the action bar down with its popup. The caller already collects these. */
    unmount: () => unmountActions?.(),
    /** Which listing is on screen, for the caller to put in the address bar when it opens. */
    currentId: () => listings[index].id,
  };
}

/**
 * Escapes text before it goes into markup that MapLibre hands to `innerHTML`.
 *
 * Text from the user's own settings, and every field of a listing: the title, the address, the job
 * name and the image URL all arrive from a scraped portal, and a `<` or a `"` in one of them used to
 * land in this markup unescaped - which in a document served from Fredy's own origin is stored
 * cross-site scripting. Exported for the other popups built from strings (the listing detail map,
 * the home markers on the map view).
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

/**
 * The travel times of one listing, as a line per address.
 *
 * Left out entirely when there is nothing routed. A popup is small and a row saying "unknown" would
 * take space away from the fields that do have an answer.
 *
 * @param {object} listing
 * @param {(key: string, vars?: Record<string, string|number>) => string} t
 * @returns {string} Markup, or an empty string.
 */
function renderTravelTimes(listing, t) {
  const usable = Array.isArray(listing.travelTimes) ? listing.travelTimes.filter(hasAnyTime) : [];
  if (usable.length === 0) {
    return '';
  }

  const lines = usable.map((entry) => {
    const modes = availableModes(entry)
      .map((mode) => `${mode.icon} ${formatMinutes(mode.minutes)}`)
      .join(' · ');
    return `${escapeHtml(entry.label)}: ${modes}`;
  });

  return `<span><strong>${t('travelTime.title')}</strong> ${lines.join('<br/>')}</span>`;
}

/**
 * The markup of a single listing inside the popup, with the pager on top when it is one of several.
 *
 * @param {object} listing
 * @param {number} index - Zero based position within its group.
 * @param {number} total - Size of the group.
 * @param {(key: string, vars?: Record<string, string|number>) => string} t
 * @param {string} [locale] - BCP 47 locale for the price.
 * @returns {string}
 */
function renderListingBody(listing, index, total, t, locale) {
  const capitalizedProvider = listing.provider
    ? listing.provider.charAt(0).toUpperCase() + listing.provider.slice(1)
    : 'N/A';

  const pager =
    total > 1
      ? `<div class="map-popup-content__pager" title="${t('map.popupSameAddress', { count: total })}">
          <button class="map-popup-content__pagerButton js-popup-prev" title="${t('map.popupPrev')}">
            ${renderToString(<IconChevronLeft />)}
          </button>
          <span class="map-popup-content__pagerLabel">${index + 1} / ${total}</span>
          <button class="map-popup-content__pagerButton js-popup-next" title="${t('map.popupNext')}">
            ${renderToString(<IconChevronRight />)}
          </button>
        </div>`
      : '';

  return `
    ${pager}
    <img
      src="${escapeHtml(listing.image_url || no_image)}"
      onerror="this.onerror=null;this.src='${no_image}'"
    />
    <a class="map-popup-content__title" href="#/listings/listing/${encodeURIComponent(listing.id)}">${escapeHtml(listing.title)}</a>
    <div class="map-popup-content__facts">
      <span>${t('map.popupPrice')}</span>
      <span class="map-popup-content__num">${listing.price ? escapeHtml(formatEuroPrice(listing.price, locale)) : t('common.na')}</span>
      <span>${t('map.popupAddress')}</span>
      <span>${escapeHtml(listing.address || t('common.na'))}</span>
      <span>${t('map.popupJob')}</span>
      <span>${escapeHtml(listing.job_name || t('common.na'))}</span>
      <span>${t('map.popupProvider')}</span>
      <span>${escapeHtml(capitalizedProvider)}</span>
      <span>${t('map.popupSize')}</span>
      <span class="map-popup-content__num">${listing.size != null ? `${escapeHtml(formatDecimal(listing.size, locale))} m²` : t('common.na')}</span>
    </div>
    ${renderTravelTimes(listing, t)}
    <div class="map-popup-content__actions"></div>`;
}
