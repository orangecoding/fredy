const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
  const size = o.size == null ? '--- m²' : o.size.split('Wohnfläche')[1].replace(' (ca.) ', '');
  const address = o.address;

  return Object.assign(o, { size, address });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  enabled: null,
  url: null,
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

exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'immowelt';

exports.config = config;
