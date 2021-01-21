const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
  const id = parseInt(o.id.substring(o.id.indexOf('_') + 1, o.id.length));
  const size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';
  const price = o.price.replace('Kaufpreis ', '');
  const address = o.address.split(' • ')[1];
  const title = o.title || 'No title available';

  return Object.assign(o, { id, address, price, size, title });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer: '#result-list-stage .item',
  crawlFields: {
    id: '@id',
    price: 'div[id*="selPrice_"] | trim',
    size: 'div[id*="selArea_"] | trim',
    title: '.item a img@title',
    link: 'a[id*="lnkImgToDetails_"]@href',
    address: '.item .box-25 .ellipsis .text-100 | removeNewline | trim',
  },
  paginate: '#idResultList .margin-bottom-6.margin-bottom-sm-12 .panel a.pull-right@href',
  normalize: normalize,
  filter: applyBlacklist,
};

exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

exports.metaInformation = {
  name: 'Immonet',
  baseUrl: 'https://www.immonet.de/',
  id: __filename.slice(__dirname.length + 1, -3),
};

exports.config = config;
