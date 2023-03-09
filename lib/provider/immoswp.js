import utils from '../utils.js';
let appliedBlackList = [];
function normalize(o) {
  const id = o.id.substring(o.id.indexOf('-') + 1, o.id.length);
  const size = o.size || 'N/A m²';
  const price = (o.price || '--- €').replace('Preis auf Anfrage', '--- €');
  const address = o.address || 'No address available';
  const title = o.title || 'No title available';
  const link = `https://immo.swp.de/immobilien/${id}`;
  const description = o.description;
  return Object.assign(o, { id, address, price, size, title, link, description });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: '.js-serp-item',
  sortByDateParam: 's=most_recently_updated_first',
  crawlFields: {
    id: '@id',
    price: 'div.item__spec.item-spec-price | trim',
    size: 'div.item__spec.item-spec-area | trim',
    title: 'a.js-item-title-link@title',
    address: 'div.item__locality | removeNewline | trim',
    description: 'div.item__main-info-points.clearfix p small | removeNewline | trim',
  },
  paginate: 'li.page-item.pagination__item a.page-link@href',
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immo Südwest Presse',
  baseUrl: 'https://immo.swp.de/',
  id: 'immoswp',
};
export { config };
