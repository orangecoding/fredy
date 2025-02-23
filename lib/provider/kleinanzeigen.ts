import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import utils, { buildHash } from '../utils';
import { Listing } from '#types/Listings';

let appliedBlackList: string[] = [];
let appliedBlacklistedDistricts: string[] = [];

function normalize(o: Listing): Listing {
  const size = o.size || 'N/A m²';
  const link = `https://www.kleinanzeigen.de${o.link}`;
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id, size, link });
}

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  const isBlacklistedDistrict =
    appliedBlacklistedDistricts.length === 0 ? false : utils.isOneOf(o.description, appliedBlacklistedDistricts);
  return o.title != null && !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: '#srchrslt-adtable .ad-listitem ',
  sortByDateParam: '',
  waitForSelector: 'body',
  crawlFields: {
    id: '.aditem@data-adid | int',
    price: '.aditem-main--middle--price-shipping--price | removeNewline | trim',
    size: '.aditem-main .text-module-end | removeNewline | trim',
    title: '.aditem-main .text-module-begin a | removeNewline | trim',
    link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
    description: '.aditem-main .aditem-main--middle--description | removeNewline | trim',
    address: '.aditem-main--top--left | trim | removeNewline',
  },
  normalize,
  filter,
};

const metaInformation: ProviderMetaInformation = {
  name: 'Ebay Kleinanzeigen',
  baseUrl: 'https://www.kleinanzeigen.de/',
  id: 'kleinanzeigen',
};

const init = (sourceConfig: Partial<ProviderConfig>, blacklist: string[], blacklistedDistricts: string[]) => {
  config.enabled = sourceConfig.enabled ?? false;
  config.url = sourceConfig.url ?? null;
  appliedBlackList = blacklist || [];
  appliedBlacklistedDistricts = blacklistedDistricts || [];
};

export { config, metaInformation, init };
