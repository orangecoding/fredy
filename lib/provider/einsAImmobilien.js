import utils from '../utils.js';
let appliedBlackList = [];
function normalize(o) {
  let size = `${o.size.replace(' Wohnfläche ', '').trim()}`;
  if (o.rooms != null) {
    size += ` / / ${o.rooms.trim()}`;
  }
  const link = `https://www.1a-immobilienmarkt.de/expose/${o.id}.html`;
  return Object.assign(o, { size, link });
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
    description: '.tabelle .inner_object_data .objekt_beschreibung | removeNewline | trim',
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
