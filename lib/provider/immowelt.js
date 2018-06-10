const Fredy = require('../fredy');
const config = require('../../conf/config.json');
const utils = require('../utils');

function normalize(o) {
  const size = o.size == null ? '--- m²' || o.size.split('Wohnfläche')[1].replace(' (ca.) ', '');
  const address = o.address;

  return Object.assign(o, { size, address });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, config.blacklist);
  const descNotBlacklisted = !utils.isOneOf(o.description, config.blacklist);

  return titleNotBlacklisted && descNotBlacklisted;
}

const immowelt = {
  name: 'immowelt',
  enabled: config.sources.immowelt.enabled,
  url: config.sources.immowelt.url,
  crawlContainer: '.immoliste .js-object.listitem_wrap ',
  crawlFields: {
    id: '@data-estateid | int',
    price: '.hardfacts_3 strong | removeNewline | trim',
    size: '.js-object.listitem_wrap .hardfacts_3 div:nth-child(2)| removeNewline | trim',
    title: '.listcontent.clear h2',
    link: 'a@href',
    address: '.listcontent .details .listlocation| removeNewline | trim'
  },
  paginate: '#pnlPaging #nlbPlus@href',
  normalize: normalize,
  filter: applyBlacklist
};

module.exports = new Fredy(immowelt);
