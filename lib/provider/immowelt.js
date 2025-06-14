import utils, { buildHash } from '../utils.js';
import { DEFAULT_HEADER } from '../services/extractor/utils.js';

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

function getExposeConfig(expose) {
  return {
    url: expose.link,
    headers: DEFAULT_HEADER,
    waitForSelector: '[data-testid="aviv.CDP.main"]'
  };
}

function getExposeSelectors() {
  return [
    '[data-testid="cdp-seo-wrapper"]',
    '[data-testid="aviv.CDP.Sections.Price"]',
    '[data-testid="aviv.CDP.Sections.Description.MainDescription"]',
    '[data-testid="cdp-floorplan"]',
    '[data-testid="cdp-location"]',
    '[data-testid="aviv.CDP.Sections.Energy"]',
    '[data-testid="aviv.CDP.Sections.Description.AdditionalDescription"]',
  ];
}

const config = {
  id: 'immowelt',
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
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
  },
  normalize: normalize,
  filter: applyBlacklist,
  getExposeConfig: getExposeConfig,
  getExposeSelectors: getExposeSelectors
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
