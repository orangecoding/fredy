import utils, {buildHash} from '../utils.js';
let appliedBlackList = [];
function nullOrEmpty(val) {
  return val == null || val.length === 0;
}
function normalize(o) {
  const title = nullOrEmpty(o.title) ? 'NO TITLE FOUND' : o.title.replace('NEU', '');
  const address = nullOrEmpty(o.address) ? 'NO ADDRESS FOUND' : (o.address || '').replace(/\(.*\),.*$/, '').trim();
  const link = nullOrEmpty(o.link) ? 'NO LINK' : `https://www.immobilienscout24.de${o.link.substring(o.link.indexOf('/expose'))}`;
  const id = buildHash(o.id, o.price);
  return Object.assign(o, { id, title, address, link });
}
function applyBlacklist(o) {
  return !utils.isOneOf(o.title, appliedBlackList);
}
const config = {
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
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immoscout',
  baseUrl: 'https://www.immobilienscout24.de/',
  id: 'immoscout',
};
export { config };
