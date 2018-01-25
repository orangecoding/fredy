const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
  const size = `${o.size.replace(' Wohnfläche ', '').trim()} / ${o.rooms.trim()}`;
  const link = `https://www.1a-immobilienmarkt.de/expose/${o.id}.html`;

  return Object.assign(o, { size, link });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, config.blacklist);
  const descNotBlacklisted = !utils.isOneOf(o.description, config.blacklist);

  return titleNotBlacklisted && descNotBlacklisted;
}

const einsAImmobilien = {
  name: 'einsAImmobilien',
  enabled: config.sources.einsAImmobilien.enabled,
  url: config.sources.einsAImmobilien.url,
  crawlContainer: '.tabelle',
  crawlFields: {
    id: '.inner_object_data input[name="marker_objekt_id"]@value | int',
    price: '.tabelle .inner_object_data .single_data_price | removeNewline | trim',
    size: '.tabelle .inner_object_data .data_boxes div:nth-child(1)',
    rooms: '.tabelle .inner_object_data .data_boxes div:nth-child(2)',
    title: '.tabelle .inner_object_data .tabelle_inhalt_titel_black | removeNewline | trim',
    description: '.tabelle .inner_object_data .objekt_beschreibung | removeNewline | trim'
  },
  paginate: '.pagination_blocks div:last a@href',
  normalize: normalize,
  filter: applyBlacklist
};

module.exports = new Fredy(einsAImmobilien);
