/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * SeLoger, France's largest portal of its own (as opposed to a classifieds site with a property
 * section).
 *
 * SeLoger belongs to the same group as immowelt and has been moved onto the same application: its
 * result page posts the search to `/serp-bff/search`, asks `/classifiedList/{ids}` for the cards,
 * and the exposé embeds the same server state - with French place ids and French copy, and nothing
 * else changed. So this is a descriptor over the immowelt client rather than a second copy of it,
 * the way `immoscoutAt` is one over the ImmoScout client:
 *
 * - the search url is translated by the same search model (`immowelt-search-model.js`), because
 *   `https://www.seloger.com/classified-search?distributionTypes=Rent&estateTypes=Apartment&locations=AD08FR31096`
 *   is the same search object immowelt's urls spell
 * - the requests go through the same warmed browser page (`immoweltBff.js`), because the origin sits
 *   behind the same DataDome wall
 * - the card and the exposé are read by the same code (`classified.js`)
 *
 * - the config itself is the platform's (`platformProvider.js`), activity and price probes included
 *
 * What is SeLoger's own is the site entry in `site.js` - origin, language and country - and the
 * fact that its rents are quoted per advert either charges included or not, see the note on the
 * config below. Its results also carry the adverts of Belles Demeures, SeLoger's luxury sister
 * portal, whose cards link to bellesdemeures.com: they are stored like any other, and miss the exposé
 * enrichment and the price tracking, since that exposé is not the platform's to read. Whether they
 * are still online is asked on their own site all the same (`LINKED_SITES` in `site.js`).
 *
 * The landing pages SeLoger links to from its home page and from search engines
 * (`/recherche/location/appartement/france/ad02fr1`) are result pages too, but they spell the search
 * in the path rather than in the query the search model reads. They are refused with a message
 * saying so, rather than with the search model's "no locations" - which would be true, and useless
 * to somebody looking at a page full of flats.
 */

import { SITES } from '../services/immowelt/site.js';
import { buildClassifiedProvider } from '../services/immowelt/platformProvider.js';

/** The one site this provider searches. */
const SITE = SITES['seloger.com'];

/** The path of SeLoger's landing pages, which carry their search in the path. */
const LANDING_PAGE = /^\/recherche(\/|$)/;

/**
 * Refuse one of SeLoger's landing pages, whose search the search model cannot read.
 *
 * @param {string} url a url on seloger.com
 * @returns {void}
 * @throws {Error} when the url is a landing page
 */
function refuseLandingPage(url) {
  if (LANDING_PAGE.test(new URL(url).pathname)) {
    throw new Error(
      `'${url}' is one of SeLoger's landing pages, which keep their search in the path where Fredy cannot read ` +
        `it. Run the search from SeLoger's search form and copy the address of the result page once it reads ` +
        `${SITE.origin}/classified-search?...`,
    );
  }
}

// The whole config is the platform's, over SeLoger's one site - see
// `services/immowelt/platformProvider.js`. The headline figure the card shows is stored as it is: a
// rent there is quoted per advert either charges comprises ("cc") or hors charges ("hc"), and the
// card states no charges figure to take a "cc" rent down to the one without them. Which of the two
// a stored rent is travels with it, see `chargesIncluded` in `classified.js`.
const { config, createConfig } = buildClassifiedProvider(SITE.provider, { refuseUrl: refuseLandingPage });

export const metaInformation = {
  countries: [SITE.country],
  name: 'SeLoger',
  baseUrl: `${SITE.origin}/`,
  id: 'seloger',
};

export { config, createConfig };
