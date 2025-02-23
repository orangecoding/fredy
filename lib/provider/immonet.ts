import utils, { buildHash } from '../utils';
import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import { Listing } from '#types/Listings';

let appliedBlackList: string[] = [];

/**
 * Note, Immonet is really a piece of sh*t. It is using a weird combination of React and some buttons (instead of links),
 * so that if somebody clicks the listing, a new page will open with the actual link to the listing. Of course, a scraper
 * cannot do this (which is why I always just return the link to the whole list of listings).
 * This is not only bad for us, but also bad for people with disabilities...
 */

function normalize(o: Listing): Listing {
  const size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';
  const price = (o.price ?? 'N/A €').replace('Kaufpreis ', '');
  const address = o.address?.split(' • ')[o.address.split(' • ').length - 1] ?? '';
  const title = o.title || 'N/A';
  const link = config.url;
  const hash = buildHash(title, price);
  const id = hash ?? 'NO_ID';
  return Object.assign(o, { id, address, price, size, title, link });
}

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: 'div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'sortby=19',
  waitForSelector: 'div[data-testid="serp-resultscount-testid"]',
  crawlFields: {
    id: 'button@title |trim', // Immonet is a piece of sh*t. See comment above
    title: 'button@title |trim',
    price: 'div[data-testid="cardmfe-price-testid"] | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | trim',
  },
  normalize,
  filter,
};

const init = (sourceConfig: Partial<ProviderConfig>, blacklist: string[]) => {
  config.enabled = sourceConfig.enabled ?? false;
  config.url = sourceConfig.url ?? null;
  appliedBlackList = blacklist ?? [];
};

const metaInformation: ProviderMetaInformation = {
  name: 'Immonet',
  baseUrl: 'https://www.immonet.de/',
  id: 'immonet',
};

export { config, metaInformation, init };
