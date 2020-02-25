const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
  const title = o.title.replace('NEU', '');
  const address = (o.address || '').replace(/\(.*\),.*$/, '').trim();

  return Object.assign(o, { title, address });
}

function applyBlacklist(o) {
  return !utils.isOneOf(o.title, appliedBlackList);
}

const config = {
  enabled: null,
  url: null,
  crawlContainer: '#resultListItems li.result-list__listing',
  crawlFields: {
    id: '.result-list-entry@data-obid | int',
    price: '.result-list-entry .result-list-entry__criteria .grid-item:first-child dd | removeNewline | trim',
    size: '.result-list-entry .result-list-entry__criteria .grid-item:nth-child(2) dd | removeNewline | trim',
    title: '.result-list-entry .result-list-entry__brand-title-container h5 | removeNewline | trim',
    link: '.result-list-entry .result-list-entry__brand-title-container@href',
    address: '.result-list-entry .result-list-entry__map-link'
  },
  paginate: '#pager .align-right a@href',
  normalize: normalize,
  filter: applyBlacklist
};

exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'immoscout';

exports.config = config;
