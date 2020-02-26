const utils = require('../utils');

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
  enabled: null,
  url: null,
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

exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'einsAImmobilien';

exports.config = config;
