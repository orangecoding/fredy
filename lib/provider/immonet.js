const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
  const id = parseInt(o.id.split('_')[1], 10);
  const title = o.title.replace('NEU ', '');
  const address = o.address.split(' - ')[1];

  return Object.assign(o, { id, title, address });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, config.blacklist);
  const descNotBlacklisted = !utils.isOneOf(o.description, config.blacklist);

  return titleNotBlacklisted && descNotBlacklisted;
}

const immonet = {
  name: 'immonet',
  enabled: config.sources.immonet.enabled,
  url: config.sources.immonet.url,
  crawlContainer: '#idResultList .search-object',
  crawlFields: {
    id: '.search-info a@id',
    price: '#keyfacts-bar div:first-child span',
    size: '#keyfacts-bar div:nth-child(2) .text-primary-highlight',
    title: '.search-info a | removeNewline | trim',
    link: '.search-info a@href',
    address: '.search-info p | removeNewline | trim'
  },
  paginate: '#idResultList .margin-bottom-6.margin-bottom-sm-12 .panel a.pull-right@href',
  normalize: normalize,
  filter: applyBlacklist
};

module.exports = new Fredy(immonet);
