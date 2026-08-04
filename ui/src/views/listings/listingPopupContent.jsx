/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { renderToString } from 'react-dom/server';
import { IconChevronLeft, IconChevronRight, IconDelete, IconEyeOpened, IconLink } from '@douyinfe/semi-icons';
import no_image from '../../assets/no_image.png';
import { availableModes, formatMinutes, hasAnyTime } from '../../components/transit/travelTimeFormat.js';

/**
 * Builds the DOM for a listing popup on the map.
 *
 * One popup can hold several listings: everything geocoded to the same spot - a whole house, or a
 * town whose listings only resolved to its centre - shares a single pin, and the popup pages
 * through them. The nearby-stops block is the same for all of them, so it sits outside the paged
 * part and is mounted once by the caller.
 *
 * The buttons still call the `viewDetails` / `deleteListing` globals the map view installs on
 * `window`, which is how this markup has always worked.
 *
 * @param {Object} params
 * @param {object[]} params.listings - The listings at this position, at least one.
 * @param {(key: string, vars?: Record<string, string|number>) => string} params.t
 * @param {() => void} [params.onPageChange] - Called after the popup switched to another listing,
 * which changes its height.
 * @returns {{element: HTMLElement, transitMount: HTMLElement}} The popup content and the empty node
 * the nearby stops are to be rendered into.
 */
export function createListingPopupContent({ listings, t, onPageChange }) {
  const element = document.createElement('div');
  element.className = 'map-popup-content';

  const body = document.createElement('div');
  element.appendChild(body);

  const transit = document.createElement('div');
  transit.className = 'map-popup-content__transit';
  transit.innerHTML = `<strong>${t('transit.nearbyTitle')}</strong>
    <div class="map-popup-content__transit-mount"></div>`;
  element.appendChild(transit);

  let index = 0;

  const render = () => {
    body.innerHTML = renderListingBody(listings[index], index, listings.length, t);

    const step = (delta) => {
      index = (index + delta + listings.length) % listings.length;
      render();
      onPageChange?.();
    };
    body.querySelector('.js-popup-prev')?.addEventListener('click', () => step(-1));
    body.querySelector('.js-popup-next')?.addEventListener('click', () => step(1));
  };

  render();

  return { element, transitMount: transit.querySelector('.map-popup-content__transit-mount') };
}

/**
 * Escapes text that came from the user's own settings before it goes into the popup markup.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
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
 * @returns {string}
 */
function renderListingBody(listing, index, total, t) {
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
      src="${listing.image_url}"
      onerror="this.onerror=null;this.src='${no_image}'"
    />
    <h4>${listing.title}</h4>
    <div class="info">
      <span><strong>${t('map.popupPrice')}</strong> ${listing.price ? listing.price + ' €' : t('common.na')}</span>
      <span><strong>${t('map.popupAddress')}</strong> ${listing.address || t('common.na')}</span>
      <span><strong>${t('map.popupJob')}</strong> ${listing.job_name || t('common.na')}</span>
      <span><strong>${t('map.popupProvider')}</strong> ${capitalizedProvider}</span>
      <span><strong>${t('map.popupSize')}</strong> ${listing.size != null ? `${listing.size} m²` : t('common.na')}</span>
      ${renderTravelTimes(listing, t)}
      <div style="display: flex; gap: 8px; margin-top: 8px; justify-content: space-between;">
        <div class="map-popup-content__linkButton">
          <a href="${listing.link}" target="_blank" rel="noopener noreferrer">
            ${renderToString(<IconLink />)}
          </a>
        </div>
        <button
          class="map-popup-content__detailsButton"
          title="${t('map.popupViewDetails')}"
          onclick="viewDetails('${listing.id}')"
        >
          ${renderToString(<IconEyeOpened />)}
        </button>
        <button
          class="map-popup-content__deleteButton"
          title="${t('map.popupRemove')}"
          onclick="deleteListing('${listing.id}')"
        >
          ${renderToString(<IconDelete />)}
        </button>
      </div>
    </div>`;
}
