import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import utils, { buildHash } from '../utils';
import { Listing } from '#types/Listings';

let appliedBlackList: string[] = [];

function normalize(o: Listing): Listing {
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id });
}

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer:
    'div[data-testid="serp-core-scrollablelistview-testid"]:not(div[data-testid="serp-enlargementlist-testid"] div[data-testid="serp-card-testid"]) div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'order=DateDesc',
  waitForSelector: 'div[data-testid="serp-gridcontainer-testid"]',
  crawlFields: {
    id: 'a@href',
    price: 'div[data-testid="cardmfe-price-testid"] | removeNewline | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | removeNewline | trim',
    title: '.css-1cbj9xw',
    link: 'a@href',
    address: 'div[data-testid="cardmfe-description-box-address"] | removeNewline | trim',
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
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};

export { config, metaInformation, init };
