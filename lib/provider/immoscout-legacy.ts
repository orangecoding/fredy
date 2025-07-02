import utils, { buildHash } from '../utils';
import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import { Listing } from '#types/Listings';

let appliedBlackList: string[] = [];

function normalize(o: Listing): Listing {
  const title: string = (o.title ?? 'N/A').replace('NEU', '');
  const address: string = (o.address ?? 'N/A').replace(/\(.*\),.*$/, '').trim();
  o.link = o.link ?? 'NO LINK';
  const link = `https://www.immobilienscout24.de${o.link.substring(o.link.indexOf('/expose'))}`;
  const hash = buildHash(o.id, o.price);
  const id = hash ?? 'NO_ID';
  return Object.assign(o, { id, title, address, link });
}

function filter(o: Listing) {
  return !utils.isOneOf(o.title, appliedBlackList);
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: '#resultListItems li.result-list__listing',
  sortByDateParam: 'sorting=2',
  waitForSelector: 'body',
  crawlFields: {
    id: '.result-list-entry@data-obid | int',
    price: '.result-list-entry .result-list-entry__criteria .grid-item:first-child dd | removeNewline | trim',
    size: '.result-list-entry .result-list-entry__criteria .grid-item:nth-child(2) dd | removeNewline | trim',
    title: '.result-list-entry .result-list-entry__brand-title-container h2 | removeNewline | trim',
    link: '.result-list-entry .result-list-entry__brand-title-container@href',
    address: '.result-list-entry .result-list-entry__map-link',
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
  name: 'Immoscout-legacy',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout-legacy',
};

export { config, metaInformation, init };
