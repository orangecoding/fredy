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
 * The hand-written example listings. The first one is the one the tour opens on the listing detail
 * page, and it is the newest of all, so it is also the first card on the listings overview.
 *
 * Spread over the city on purpose, so the map has pins in more than one district, and priced around
 * a typical household budget so the affordability hints have both answers to show.
 *
 * @type {ReadonlyArray<Readonly<TourListing>>}
 */
const HAND_WRITTEN_LISTINGS = Object.freeze(
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

/**
 * Stadtteile the generated listings are spread over, with a rough centre, a postcode, two street
 * names and what a square metre of cold rent costs there. Rough on purpose: the point is a map with
 * pins across the whole city and prices that differ the way they do in reality.
 *
 * @type {ReadonlyArray<Readonly<{name: string, lat: number, lng: number, zip: string, streets: string[], rent: number}>>}
 */
const DISTRICTS = Object.freeze([
  { name: 'Pempelfort', lat: 51.2365, lng: 6.787, zip: '40479', streets: ['Kaiserstraße', 'Moltkestraße'], rent: 15.2 },
  { name: 'Bilk', lat: 51.209, lng: 6.783, zip: '40223', streets: ['Bachstraße', 'Aachener Straße'], rent: 14.1 },
  {
    name: 'Oberkassel',
    lat: 51.23,
    lng: 6.756,
    zip: '40545',
    streets: ['Dominikanerstraße', 'Belsenstraße'],
    rent: 17.8,
  },
  { name: 'Flingern', lat: 51.228, lng: 6.804, zip: '40235', streets: ['Hermannstraße', 'Lindenstraße'], rent: 14.6 },
  { name: 'Unterbilk', lat: 51.213, lng: 6.768, zip: '40219', streets: ['Bilker Allee', 'Neusser Straße'], rent: 16.4 },
  {
    name: 'Derendorf',
    lat: 51.244,
    lng: 6.788,
    zip: '40476',
    streets: ['Collenbachstraße', 'Tannenstraße'],
    rent: 15.0,
  },
  { name: 'Gerresheim', lat: 51.233, lng: 6.86, zip: '40625', streets: ['Heyestraße', 'Dreherstraße'], rent: 12.3 },
  {
    name: 'Friedrichstadt',
    lat: 51.216,
    lng: 6.779,
    zip: '40215',
    streets: ['Corneliusstraße', 'Hüttenstraße'],
    rent: 15.6,
  },
  {
    name: 'Düsseltal',
    lat: 51.234,
    lng: 6.803,
    zip: '40237',
    streets: ['Grafenberger Allee', 'Rethelstraße'],
    rent: 14.9,
  },
  {
    name: 'Golzheim',
    lat: 51.249,
    lng: 6.77,
    zip: '40474',
    streets: ['Kaiserswerther Straße', 'Uerdinger Straße'],
    rent: 16.9,
  },
  { name: 'Oberbilk', lat: 51.212, lng: 6.8, zip: '40227', streets: ['Kölner Straße', 'Ellerstraße'], rent: 12.8 },
  { name: 'Benrath', lat: 51.163, lng: 6.875, zip: '40597', streets: ['Hauptstraße', 'Paulistraße'], rent: 13.2 },
  {
    name: 'Kaiserswerth',
    lat: 51.3,
    lng: 6.745,
    zip: '40489',
    streets: ['Alte Landstraße', 'Kittelbachstraße'],
    rent: 14.4,
  },
  {
    name: 'Wersten',
    lat: 51.185,
    lng: 6.815,
    zip: '40591',
    streets: ['Kölner Landstraße', 'Werstener Dorfstraße'],
    rent: 12.1,
  },
]);

const ADJECTIVES = Object.freeze(['Helle', 'Renovierte', 'Ruhige', 'Moderne', 'Charmante', 'Gepflegte', 'Sonnige']);
const FEATURES = Object.freeze([
  ' mit Balkon',
  ' mit Einbauküche',
  ' mit Aufzug',
  ' nahe dem Rhein',
  '',
  ' mit Terrasse',
  '',
]);
const ENERGY_CLASSES = Object.freeze(['A', 'B', 'C', 'C', 'D', 'D', 'E', 'F']);
const SIZES_BY_ROOMS = Object.freeze({ 1: 32, 2: 56, 3: 78, 4: 102 });

/** How many listings are generated on top of the hand-written ones. */
const GENERATED_COUNT = 34;

/**
 * A small deterministic sequence of numbers in [0, 1). Every tour gets exactly the same listings, so
 * nothing about a screenshot or a test depends on luck.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function sequence(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * The generated listings: spread over the last two weeks, with more of them recently, so the
 * dashboard's trend has a shape and a previous week to compare against, the map has pins across the
 * city, and the job's activity line has something to draw.
 *
 * None of them is newer than three hours, so the hand-written first listing stays the newest.
 *
 * @returns {TourListing[]}
 */
function generateListings() {
  const next = sequence(20260928);
  const providers = Object.keys(TOUR_PROVIDER_LINKS);
  return Array.from({ length: GENERATED_COUNT }, (_, index) => {
    const district = DISTRICTS[index % DISTRICTS.length];
    const rooms = 1 + Math.floor(next() * 4);
    const size = Math.round(SIZES_BY_ROOMS[rooms] * (0.85 + next() * 0.35));
    const price = Math.round((size * district.rent * (0.9 + next() * 0.25)) / 10) * 10;
    // Squared, so recent days get more listings than older ones.
    const hoursAgo = 3 + Math.floor(next() ** 1.6 * 13 * 24);
    const street = district.streets[index % 2];
    const number = 3 + Math.floor(next() * 120);
    const adjective = ADJECTIVES[index % ADJECTIVES.length];
    const feature = FEATURES[(index * 3) % FEATURES.length];
    return {
      id: `tour-listing-${HAND_WRITTEN_LISTINGS.length + index + 1}`,
      image: `/tour/listing-${(index % 8) + 1}.svg`,
      provider: providers[index % providers.length],
      title: `${adjective} ${rooms}-Zimmer-Wohnung in ${district.name}${feature}`,
      description: `${rooms} Zimmer auf ${size} m² in ${district.name}. Gute Anbindung an Bus und Bahn, Einkaufsmöglichkeiten in der Nähe.`,
      address: `${street} ${number}, ${district.zip} Düsseldorf`,
      price,
      size,
      rooms,
      latitude: Number((district.lat + (next() - 0.5) * 0.012).toFixed(5)),
      longitude: Number((district.lng + (next() - 0.5) * 0.018).toFixed(5)),
      buildYear: 1900 + Math.floor(next() * 120),
      energyClass: ENERGY_CLASSES[index % ENERGY_CLASSES.length],
      publishedHoursAgo: hoursAgo,
    };
  });
}

/**
 * Every example listing: the hand-written ones first, then the generated ones.
 *
 * @type {ReadonlyArray<Readonly<TourListing>>}
 */
export const TOUR_LISTINGS = Object.freeze([
  ...HAND_WRITTEN_LISTINGS,
  ...generateListings().map((listing) => Object.freeze(listing)),
]);

/**
 * What the example listings pretend the broadband register answered, in the register's own raw form.
 *
 * Raw rather than finished records, so they go through the same normaliser a real lookup does and
 * come out in exactly the shape the listing detail and the connectivity filters expect. Three kinds
 * of address, the way a city really mixes them: fibre with full 5G, cable with 4G everywhere, and an
 * older street on VDSL where only one network has 5G yet.
 *
 * @type {ReadonlyArray<Readonly<{fixed: Record<string, number>, mobile: Record<string, number|string>}>>}
 */
export const TOUR_CONNECTIVITY = Object.freeze([
  Object.freeze({
    fixed: { down_fn_hh_alle_1000: 94, down_fn_hh_ftthb_1000: 81, down_fn_hh_hfc_1000: 88, down_fn_hh_fttc_100: 97 },
    mobile: {
      beste_tech: '5g',
      verf_2g: 1,
      verf_4g: 1,
      verf_5g: 1,
      verf_4g_dt: 1,
      verf_5g_dt: 1,
      verf_4g_vf: 1,
      verf_5g_vf: 1,
      verf_4g_tf: 1,
      verf_5g_tf: 1,
      verf_4g_ee: 2,
    },
  }),
  Object.freeze({
    fixed: { down_fn_hh_alle_1000: 86, down_fn_hh_hfc_1000: 86, down_fn_hh_fttc_200: 91 },
    mobile: { beste_tech: '4g', verf_2g: 1, verf_4g: 1, verf_4g_dt: 1, verf_4g_vf: 1, verf_4g_tf: 1, verf_4g_ee: 2 },
  }),
  Object.freeze({
    fixed: { down_fn_hh_alle_100: 93, down_fn_hh_fttc_100: 93 },
    mobile: {
      beste_tech: '5g',
      verf_2g: 1,
      verf_4g: 1,
      verf_5g: 1,
      verf_4g_dt: 1,
      verf_5g_dt: 1,
      verf_4g_vf: 1,
      verf_4g_tf: 1,
    },
  }),
]);
