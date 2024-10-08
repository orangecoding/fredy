import utils, { buildHash } from '../utils.js';
let appliedBlackList = [];

function normalize(o) {
  let size = `${o.size.replace(' Wohnfläche ', '').trim()}`;
  if (o.rooms != null) {
    size += ` / / ${o.rooms.trim()}`;
  }
  const link = `https://www.1a-immobilienmarkt.de/expose/${o.id}.html`;
  const price = normalizePrice(o.price);
  const id = buildHash(o.id, price);
  return Object.assign(o, { id, price, size, link });
}

/**
 * einsAImmobilien sometimes use a weird pricing label such as `775.700,00 EUR Kaufpreis ab 2.475 € mtl`.
 * Make sure to extract only the actual price out of the string.
 * @param price
 * @returns {*}
 */
function normalizePrice(price) {
  if (price == null) {
    return null;
  }
  const regex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s?(EUR|€)/g;
  const result = price.match(regex);
  if (result == null || result.length === 0) {
    return price;
  }
  return result[0];
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer: '.tabelle',
  sortByDateParam: 'sort_type=newest',
  crawlFields: {
    id: '.inner_object_data input[name="marker_objekt_id"]@value | int',
    price: '.tabelle .inner_object_data .single_data_price | removeNewline | trim',
    size: '.tabelle .inner_object_data .data_boxes div:nth-child(1)',
    rooms: '.tabelle .inner_object_data .data_boxes div:nth-child(2)',
    title: '.tabelle .inner_object_data .tabelle_inhalt_titel_black | removeNewline | trim',
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
  name: '1a Immobilien',
  baseUrl: 'https://www.1a-immobilienmarkt.de/',
  id: 'einsAImmobilien',
};
export { config };
