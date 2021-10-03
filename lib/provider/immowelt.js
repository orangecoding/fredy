const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
  return o;
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
  crawlContainer: "div[class^='EstateItem-']",
  crawlFields: {
    id: 'a@id',
    price: "div[class^='KeyFacts-'] [data-test='price'] | removeNewline | trim",
    size: "div[class^='KeyFacts-'] [data-test='area'] | removeNewline | trim",
    title: "div[class^='FactsMain-'] h2",
    link: 'a@href',
    address: "div[class^='estateFacts-'] span | removeNewline | trim",
  },
  paginate: '#pnlPaging #nlbPlus@href',
  normalize: normalize,
  filter: applyBlacklist,
};

exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
exports.metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: __filename.slice(__dirname.length + 1, -3),
};

exports.config = config;
