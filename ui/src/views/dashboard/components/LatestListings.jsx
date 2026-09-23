/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { formatEuroPrice } from '../../../services/price/priceService.js';
import { formatPricePerSqm } from '../../../services/listings/marketBenchmark.js';
import { formatDecimal } from '../../../services/number/numberService.js';
import { relativeTime } from '../../../services/time/relativeTime.js';

/** The thumbnail a listing without a usable photo falls back to. Drawn, not imported: one icon
 *  does not earn an asset, and an inline path follows the theme through currentColor. */
const THUMB_PLACEHOLDER = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 11 12 4.5 20 11" />
    <path d="M6 10.5V19h12v-8.5" />
  </svg>
);

/**
 * The address, living space and room count of one listing, as one line.
 *
 * Whatever is missing is left out rather than filled with a dash: three separators around two
 * empty slots say less than the one fact that is actually known.
 *
 * @param {Object} row
 * @param {string} locale
 * @param {(key: string, params?: Object) => string} t
 * @returns {string}
 */
function metaLine(row, locale, t) {
  return [
    row.address,
    row.size == null ? null : `${formatDecimal(row.size, locale)} m²`,
    row.rooms == null ? null : t('listing.detail.fieldRoomsValue', { count: formatDecimal(row.rooms, locale) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The newest listings across every search the user can see.
 *
 * This is what the dashboard is for and it used to be one navigation away: the page led with
 * standing totals and left the bottom half of the screen empty, so "what came in" was a question
 * you had to leave the dashboard to answer.
 *
 * Every row is a real `<button>` rather than a div with a handler, so the list can be walked and
 * opened from the keyboard. The three right-hand columns are fixed widths in the stylesheet and
 * keep their space even when a listing has no price per square metre, because a column edge that
 * moves from row to row costs more than the gap it saves.
 *
 * @param {Object} props
 * @param {Array<Object>} props.listings Newest first, at most eight.
 * @param {string} props.locale
 * @param {(key: string, params?: Object) => string} props.t
 * @param {(id: string) => void} props.onOpen Opens one listing.
 * @param {() => void} props.onOpenAll Opens the listings overview. The plan's prop list omits it
 *   and the one for the total below; both are what `dashboard.latestAll` needs to say anything,
 *   and they follow the shape `JobsPanel` uses for its own footer link.
 * @param {number} props.total Listings found in total, which is the figure the link names - not
 *   the eight rows above it.
 * @returns {React.ReactElement}
 */
export default function LatestListings({ listings = [], locale = 'de-DE', t, onOpen, onOpenAll, total = 0 }) {
  const rows = Array.isArray(listings) ? listings : [];

  return (
    <div className="dashboard__card">
      <div className="dashboard__cardHead">
        <h2 className="dashboard__cardLabel">{t('dashboard.sectionLatest')}</h2>
        <span className="dashboard__spacer" />
        <button type="button" className="dashboard__link" onClick={onOpenAll}>
          {t('dashboard.latestAll', { count: String(total) })}
        </button>
      </div>
      <div className="dashboard__latest">
        {rows.length === 0 ? (
          <div className="dashboard__latestEmpty">{t('dashboard.latestEmpty')}</div>
        ) : (
          rows.map((row) => (
            <button type="button" className="dashboard__latestRow" key={row.id} onClick={() => onOpen(row.id)}>
              <div className="dashboard__thumb">
                {THUMB_PLACEHOLDER}
                {row.image_url && (
                  <img
                    src={row.image_url}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
              <div className="dashboard__latestText">
                <span className="dashboard__latestTitle">{row.title}</span>
                <span className="dashboard__latestMeta">{metaLine(row, locale, t)}</span>
              </div>
              {/* `price` is nullable (only id, link and title are required), and formatting null
                  prints "0 €". */}
              <span className="dashboard__latestPrice">
                {row.price != null ? formatEuroPrice(row.price, locale) : t('common.na')}
              </span>
              <span className="dashboard__latestSqm">
                {row.price_per_sqm != null && (
                  <span className="dashboard__chip">{formatPricePerSqm(row.price_per_sqm, locale)}</span>
                )}
              </span>
              <span className="dashboard__latestAge">{relativeTime(row.created_at, t)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

LatestListings.displayName = 'LatestListings';
