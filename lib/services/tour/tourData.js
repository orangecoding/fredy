/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The example data the onboarding tour shows while it runs.
 *
 * A new account has nothing to look at: no job, no listing, an empty map. A tour through empty
 * pages explains nothing, so for its duration the account is given one example job and a handful
 * of listings. Everything here is invented. The addresses are real streets so the map and the
 * nearby transit stops have something sensible to show, but no listing describes a real advert.
 *
 * Hardcoded rather than scraped for the same reasons the demo job's home address is: the tour has
 * to work offline, instantly and identically for everybody, and a tour that depended on a portal
 * answering would fail for exactly the people it is meant to win over.
 */

/**
 * One example listing, in the shape `storeListings` takes (see `ParsedListing`), plus how long ago
 * it pretends to have been published.
 *
 * @typedef {Object} TourListing
 * @property {string} id Stable hash of the listing within the tour job.
 * @property {string} provider Provider id the listing pretends to come from.
 * @property {string} title
 * @property {string} description
 * @property {string} address
 * @property {number} price Monthly cold rent in EUR.
 * @property {number} size Living space in square metres.
 * @property {number} rooms
 * @property {number} latitude
 * @property {number} longitude
 * @property {number} [buildYear]
 * @property {string} [energyClass]
 * @property {number} publishedHoursAgo How many hours before the start of the tour it was published.
 * @property {string} image Path of the listing's picture, served from the app's own `public/tour/`.
 */

/** Display name of the example job. */
export const TOUR_JOB_NAME = 'Fredy Tour: Düsseldorf';

/**
 * Where each provider's example listings link to.
 *
 * The portal's front page rather than an invented advert URL: a link that is followed should land
 * somewhere real, and an invented path would be a 404 on somebody else's server.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TOUR_PROVIDER_LINKS = Object.freeze({
  immoscout: 'https://www.immobilienscout24.de/',
  immowelt: 'https://www.immowelt.de/',
  kleinanzeigen: 'https://www.kleinanzeigen.de/',
});

/**
 * The pictures are illustrations drawn for the tour (`public/tour/`), one per listing, served by the
 * app itself: a stock photo would need a licence and an external host would need the network, and
 * "no image available" on every card made the example look broken.
 *
 * The example listings. The first one is the one the tour opens on the listing detail page.
 *
 * Spread over the city on purpose, so the map has pins in more than one district, and priced around
 * a typical household budget so the affordability hints have both answers to show.
 *
 * @type {ReadonlyArray<Readonly<TourListing>>}
 */
export const TOUR_LISTINGS = Object.freeze(
  [
    {
      id: 'tour-listing-1',
      image: '/tour/listing-1.svg',
      provider: 'immoscout',
      title: 'Helle 3-Zimmer-Altbauwohnung mit Balkon in Pempelfort',
      description:
        'Frisch renovierte Altbauwohnung im zweiten Obergeschoss mit hohen Decken, Dielenboden und einem ruhigen Balkon zum Innenhof. Einbauküche vorhanden, Keller inklusive.',
      address: 'Nordstraße 45, 40477 Düsseldorf',
      price: 1150,
      size: 78,
      rooms: 3,
      latitude: 51.2381,
      longitude: 6.7826,
      buildYear: 1908,
      energyClass: 'D',
      publishedHoursAgo: 2,
    },
    {
      id: 'tour-listing-2',
      image: '/tour/listing-2.svg',
      provider: 'immowelt',
      title: 'Moderne 2-Zimmer-Wohnung nahe S-Bahnhof Bilk',
      description:
        'Neubauwohnung mit bodentiefen Fenstern, Fußbodenheizung und Aufzug. Der S-Bahnhof Bilk ist in fünf Minuten zu Fuß erreichbar.',
      address: 'Helmholtzstraße 20, 40215 Düsseldorf',
      price: 890,
      size: 58,
      rooms: 2,
      latitude: 51.2104,
      longitude: 6.781,
      buildYear: 2019,
      energyClass: 'A',
      publishedHoursAgo: 5,
    },
    {
      id: 'tour-listing-3',
      image: '/tour/listing-3.svg',
      provider: 'kleinanzeigen',
      title: 'Großzügige 4-Zimmer-Wohnung in Oberkassel mit Rheinnähe',
      description:
        'Familienfreundliche Wohnung mit zwei Bädern, Wohnküche und Blick ins Grüne. Der Rhein und die Luegallee liegen direkt um die Ecke.',
      address: 'Luegallee 60, 40545 Düsseldorf',
      price: 1890,
      size: 118,
      rooms: 4,
      latitude: 51.2319,
      longitude: 6.7546,
      buildYear: 1962,
      energyClass: 'E',
      publishedHoursAgo: 9,
    },
    {
      id: 'tour-listing-4',
      image: '/tour/listing-4.svg',
      provider: 'immoscout',
      title: 'Gemütliche 2,5-Zimmer-Wohnung in Flingern',
      description:
        'Ruhig gelegene Wohnung im Hinterhaus, zu Fuß zur Ackerstraße mit Cafés und Wochenmarkt. Tageslichtbad mit Wanne.',
      address: 'Ackerstraße 100, 40233 Düsseldorf',
      price: 960,
      size: 67,
      rooms: 2.5,
      latitude: 51.229,
      longitude: 6.805,
      buildYear: 1955,
      energyClass: 'C',
      publishedHoursAgo: 14,
    },
    {
      id: 'tour-listing-5',
      image: '/tour/listing-5.svg',
      provider: 'immowelt',
      title: 'Kompakte 1-Zimmer-Wohnung in Unterbilk',
      description:
        'Ideal für Pendler: kleine, gut geschnittene Wohnung mit Pantryküche, wenige Minuten vom Medienhafen und der Stadtbahn entfernt.',
      address: 'Lorettostraße 30, 40219 Düsseldorf',
      price: 620,
      size: 34,
      rooms: 1,
      latitude: 51.212,
      longitude: 6.77,
      buildYear: 1974,
      energyClass: 'D',
      publishedHoursAgo: 20,
    },
    {
      id: 'tour-listing-6',
      image: '/tour/listing-6.svg',
      provider: 'kleinanzeigen',
      title: '3-Zimmer-Wohnung mit Loggia in Derendorf',
      description:
        'Gepflegte Wohnung in einem ruhigen Mehrfamilienhaus mit Loggia nach Westen. Stellplatz in der Tiefgarage kann dazugemietet werden.',
      address: 'Duisburger Straße 80, 40479 Düsseldorf',
      price: 1240,
      size: 84,
      rooms: 3,
      latitude: 51.2419,
      longitude: 6.7869,
      buildYear: 1998,
      energyClass: 'B',
      publishedHoursAgo: 28,
    },
    {
      id: 'tour-listing-7',
      image: '/tour/listing-7.svg',
      provider: 'immoscout',
      title: 'Ruhige Dachgeschosswohnung in Gerresheim',
      description:
        'Dachgeschosswohnung mit Gauben und großem Wohnzimmer. Der Bahnhof Gerresheim liegt nur wenige Gehminuten entfernt.',
      address: 'Benderstraße 50, 40625 Düsseldorf',
      price: 780,
      size: 64,
      rooms: 2,
      latitude: 51.235,
      longitude: 6.862,
      buildYear: 1936,
      energyClass: 'F',
      publishedHoursAgo: 40,
    },
    {
      id: 'tour-listing-8',
      image: '/tour/listing-8.svg',
      provider: 'immowelt',
      title: 'Stilvolle 3-Zimmer-Wohnung in der Friedrichstadt',
      description:
        'Zentral und trotzdem ruhig: Wohnung mit Parkett, Gäste-WC und Einbauküche, nur zwei Stationen vom Hauptbahnhof entfernt.',
      address: 'Kirchfeldstraße 70, 40217 Düsseldorf',
      price: 1320,
      size: 88,
      rooms: 3,
      latitude: 51.2154,
      longitude: 6.778,
      buildYear: 1912,
      energyClass: 'D',
      publishedHoursAgo: 52,
    },
  ].map((listing) => Object.freeze(listing)),
);
