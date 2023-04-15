import utils from '../utils.js';
let appliedBlackList = [];
function normalize(o) {
  const id = o.id.substring(o.id.lastIndexOf('/') + 1, o.id.length);
  const size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';
  const price = o.price.replace('Kaufpreis ', '');
  const address = o.address.split(' • ')[o.address.split(' • ').length - 1];
  const title = o.title || 'No title available';
  const link = o.id;
  return Object.assign(o, { id, address, price, size, title, link });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: '.content-wrapper-tiles .ng-star-inserted',
  sortByDateParam: 'sortby=19',
  crawlFields: {
    id: '.card a@href',
    title: '.card h3 |trim',
    price: '.card .has-font-300 .is-bold | trim',
    size: '.card .has-font-300 .ml-100 | trim',
    address: '.card span:nth-child(2) | trim',
  },
  paginate: '#idResultList .margin-bottom-6.margin-bottom-sm-12 .panel a.pull-right@href',
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
