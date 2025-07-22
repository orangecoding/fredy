import utils, { buildHash } from '../utils.js';
let appliedBlackList = [];
function shortenLink(link) {
  return link.substring(0, link.indexOf('?'));
}
function parseId(shortenedLink) {
  return shortenedLink.substring(shortenedLink.lastIndexOf('/') + 1);
}
function normalize(o) {
  const size = o.size || 'N/A m²';
  const price = o.price || 'N/A €';
  const title = o.title || 'No title available';
  const address = o.address || 'No address available';
  const shortLink = shortenLink(o.link);
  const link = `https://www.immobilien.de/${shortLink}`;
  const id = buildHash(parseId(shortLink), o.price);
  return Object.assign(o, { id, price, size, title, address, link });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: '._ref',
  sortByDateParam: 'sort_col=*created_ts&sort_dir=desc',
  waitForSelector: 'body',
  crawlFields: {
    id: '@href', //will be transformed later
    price: '.list_entry .immo_preis .label_info',
    size: '.list_entry .flaeche .label_info | removeNewline | trim',
    title: '.list_entry .part_text h3 span',
    description: '.list_entry .description | trim',
    link: '@href',
    address: '.list_entry .place',
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
  name: 'Immobilien.de',
  baseUrl: 'https://www.immobilien.de/',
  id: 'immobilienDe',
};
export { config };
