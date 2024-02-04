import utils from '../utils.js';
import { Listing, ProviderConfig, ProviderJobInformation } from './provider.js';
let appliedBlackList = [];
function nullOrEmpty(val) {
  return val == null || val.length === 0;
}
function normalize(o: Listing): Listing {
  const title = nullOrEmpty(o.title) ? 'NO TITLE FOUND' : o.title.replace('NEU', '');
  const address = nullOrEmpty(o.address) ? 'NO ADDRESS FOUND' : (o.address || '').replace(/\(.*\),.*$/, '').trim();
  const link = `https://www.immobilienscout24.de${o.link.substring(o.link.indexOf('/expose'))}`;
  return Object.assign(o, { title, address, link });
}
function applyBlacklist(o: Listing): boolean {
  return !utils.isOneOf(o.title, appliedBlackList);
}
const config: ProviderConfig = {
  url: null,
  crawlContainer: '#resultListItems li.result-list__listing',
  sortByDateParam: 'sorting=2',
  crawlFields: {
    id: '.result-list-entry@data-obid | int',
    price: '.result-list-entry .result-list-entry__criteria .grid-item:first-child dd | removeNewline | trim',
    size: '.result-list-entry .result-list-entry__criteria .grid-item:nth-child(2) dd | removeNewline | trim',
    title: '.result-list-entry .result-list-entry__brand-title-container h2 | removeNewline | trim',
    link: '.result-list-entry .result-list-entry__brand-title-container@href',
    address: '.result-list-entry .result-list-entry__map-link',
  },
  paginate: '#pager .align-right a@href',
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig: ProviderJobInformation, blacklist) => {
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout',
};
export { config };
