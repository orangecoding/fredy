/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconArrowRight } from '../../../components/icons/StrokeIcons.jsx';
import ListingPhoto from '../../../components/listings/ListingPhoto.jsx';
import { formatEuroPrice } from '../../../services/price/priceService.js';
import { formatDeviation, formatPricePerSqm, readMarketBenchmark } from '../../../services/listings/marketBenchmark.js';
import { listingPictureSrc } from '../../../services/listings/listingPictures.js';
import { formatDecimal } from '../../../services/number/numberService.js';
import { relativeTime } from '../../../services/time/relativeTime.js';

/**
 * The street, rooms, living space and portal of one listing, as one line.
 *
 * The street only: postcode and city are the same for most of a search's listings, and on a card
 * this narrow they pushed the portal out of sight. Whatever is missing is left out rather than
 * filled with a dash: three separators around two empty slots say less than the one fact that is
 * actually known.
 *
 * @param {Object} row
 * @param {string} locale
 * @param {(key: string, params?: Object) => string} t
 * @param {Record<string, string>} providerNames
 * @returns {string}
 */
function metaLine(row, locale, t, providerNames) {
  return [
    row.address ? String(row.address).split(',')[0].trim() : null,
    row.rooms == null ? null : t('listing.detail.fieldRoomsValue', { count: formatDecimal(row.rooms, locale) }),
    row.size == null ? null : `${formatDecimal(row.size, locale)} m²`,
    row.provider ? (providerNames[row.provider] ?? row.provider) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The newest listings across every search the user can see, as photographs.
 *
 * This is what the dashboard is for. A listing is judged by its pictures first, so they lead and
 * the facts sit under them: price, price per square metre, the title, where it is and where it was
 * found, and a green line when the price per square metre is under the area's. The age sits on the
 * photo, because it is the first thing a person deciding whether to call cares about.
 *
 * Every card is a real `<button>` rather than a div with a handler, so the row can be walked and
 * opened from the keyboard.
 *
 * @param {Object} props
 * @param {Array<Object>} props.listings Newest first, at most four.
 * @param {string} props.locale
 * @param {(key: string, params?: Object) => string} props.t
 * @param {Record<string, string>} [props.providerNames] Provider id to the portal's name.
 * @param {(id: string) => void} props.onOpen Opens one listing.
 * @param {() => void} props.onOpenAll Opens the listings overview.
 * @param {number} props.total Active listings in total, which is the figure the link names.
 * @returns {React.ReactElement}
 */
export default function LatestListings({
  listings = [],
  locale = 'de-DE',
  t,
  providerNames = {},
  onOpen,
  onOpenAll,
  total = 0,
}) {
  const rows = Array.isArray(listings) ? listings : [];

  return (
    <section className="dashboard__section dashboard__latest" aria-labelledby="dashboard-latest">
      <div className="dashboard__sectionHead">
        <h2 id="dashboard-latest" className="dashboard__sectionTitle">
          {t('dashboard.sectionLatest')}
        </h2>
        <span className="dashboard__spacer" />
        <button type="button" className="dashboard__link" onClick={onOpenAll}>
          {t('dashboard.latestAll', { count: String(total) })}
          <IconArrowRight />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="dashboard__latestEmpty">{t('dashboard.latestEmpty')}</p>
      ) : (
        <div className="dashboard__listings">
          {rows.map((row) => {
            const benchmark = readMarketBenchmark(row);
            return (
              <button type="button" className="dashboard__listing" key={row.id} onClick={() => onOpen(row.id)}>
                <span className="dashboard__listingMedia">
                  <ListingPhoto src={listingPictureSrc(row)} className="dashboard__listingPhoto" />
                  <span className="dashboard__listingAge">{relativeTime(row.created_at, t)}</span>
                </span>
                <span className="dashboard__listingBody">
                  <span className="dashboard__listingPrice">
                    {/* `price` is nullable (only id, link and title are required), and formatting
                        null prints "0 €". */}
                    <span className="dashboard__listingAmount">
                      {row.price != null ? formatEuroPrice(row.price, locale) : t('common.na')}
                    </span>
                    {row.price_per_sqm != null && (
                      <span className="dashboard__listingSqm">{formatPricePerSqm(row.price_per_sqm, locale)}</span>
                    )}
                  </span>
                  <span className="dashboard__listingTitle">{row.title}</span>
                  <span className="dashboard__listingMeta">{metaLine(row, locale, t, providerNames)}</span>
                  {benchmark?.verdict === 'below' && (
                    <span className="dashboard__listingBelow">
                      {t('dashboard.belowMarket', {
                        percent: formatDeviation(Math.abs(benchmark.percent), locale, false),
                      })}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

LatestListings.displayName = 'LatestListings';
