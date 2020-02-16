const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
  const title = o.title.replace('NEU', '');
  const address = (o.address || '').replace(/\(.*\),.*$/, '').trim();

  return Object.assign(o, { title, address });
}

function applyBlacklist(o) {
  return !utils.isOneOf(o.title, config.blacklist);
}

const immoscout = {
    name: 'immoscout',
    enabled: config.sources.immoscout.enabled,
    url: config.sources.immoscout.url,
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

module.exports = new Fredy(immoscout);
