import utils from '../utils.js';
let appliedBlackList = [];
function normalize(o) {
  const id = parseInt(o.id.substring(o.id.indexOf('_') + 1, o.id.length));
  const size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';
  const price = o.price.replace('Kaufpreis ', '');
  const address = o.address.split(' • ')[o.address.split(' • ').length - 1];
  const title = o.title || 'No title available';
  //normally we would just read the link from the source, but immonet decided to trick user by adding a click listener instead of
  //a href to do some weird reporting. (Very user friendly for handicaped ppl... not)
  const link = `https://www.immonet.de/angebot/${id}`;
  return Object.assign(o, { id, address, price, size, title, link });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: '#result-list-stage .item',
  sortByDateParam: 'sortby=19',
  crawlFields: {
    id: '@id',
    price: 'div[id*="selPrice_"] | trim',
    size: 'div[id*="selArea_"] | trim',
    title: '.item a img@title',
    address: '.item .box-25 .ellipsis .text-100 | removeNewline | trim',
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
