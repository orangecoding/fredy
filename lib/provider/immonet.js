import utils, { buildHash } from '../utils.js';
let appliedBlackList = [];

/**
 * Note, Immonet is rly a piece of sh*t. It is using a weird combination of React and some buttons (instead of links),
 * so that if somebody clicks the listing, a new page will open with the actual link to the listing. Of course, a scraper
 * cannot do this (which is why I always just return the link to the whole list of listings).
 * This is not only bad for us, but also bad for ppl with disabilities...
 */

function normalize(o) {
  const size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';
  const price = o.price.replace('Kaufpreis ', '');
  const address = o.address.split(' • ')[o.address.split(' • ').length - 1];
  const title = o.title || 'No title available';
  const link = config.url;
  const id = buildHash(title, price);
  return Object.assign(o, { id, address, price, size, title, link });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: 'div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'sortby=19',
  waitForSelector: 'div[data-testid="serp-resultscount-testid"]',
  crawlFields: {
    id: 'button@title |trim', // immonet is a piece of sh*t. See comment above
    title: 'button@title |trim',
    price: 'div[data-testid="cardmfe-price-testid"] | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | trim',
  },
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immonet',
  baseUrl: 'https://www.immonet.de/',
  id: 'immonet',
};
export { config };
