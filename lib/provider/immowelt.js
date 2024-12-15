import utils, { buildHash } from '../utils.js';

let appliedBlackList = [];

function normalize(o) {
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"])',
  sortByDateParam: 'order=DateDesc',
  waitForSelector: 'body',
  crawlFields: {
    id: 'a@id',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | removeNewline | trim',
    title: '.css-1cbj9xw',
    link: 'a@href',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
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
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
