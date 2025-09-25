import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';

let appliedBlackList = [];

function normalize(o) {
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"]) div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'order=DateDesc',
  waitForSelector: 'div[data-testid="serp-gridcontainer-testid"]',
  crawlFields: {
    id: 'a@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | removeNewline | trim',
    title: 'div[data-testid="cardmfe-description-box-text-test-id"] > div:nth-of-type(2)',
    link: 'a@href',
    description: 'div[data-testid="cardmfe-description-text-test-id"] > div:nth-of-type(2) | removeNewline | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
    image: 'div[data-testid="cardmfe-picture-box-opacity-layer-test-id"] img@src',
  },
  normalize: normalize,
  filter: applyBlacklist,
  activeTester: checkIfListingIsActive,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
