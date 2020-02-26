const utils = require('../utils');

let appliedBlackList = [];
let appliedBlacklistedDistricts = [];

function normalize(o) {
  const size = o.size || '--- m²';

  return Object.assign(o, { size });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  const isBlacklistedDistrict =
      appliedBlacklistedDistricts.length === 0 ? false : utils.isOneOf(o.description, appliedBlacklistedDistricts);

  return !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  enabled: null,
  url: null,
  crawlContainer: '#srchrslt-adtable .ad-listitem',
  crawlFields: {
    id: '.aditem@data-adid | int',
    price: '.aditem-details strong | removeNewline | trim',
    size: '.aditem-main .text-module-end span:nth-child(2) | removeNewline | trim',
    title: '.aditem-main .text-module-begin a | removeNewline | trim',
    link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
    description: '.aditem-main p:not(.text-module-end) | removeNewline | trim',
    address: '.aditem-details | trim | removeNewline'
  },
  paginate: '#srchrslt-pagination .pagination-next@href',
  normalize: normalize,
  filter: applyBlacklist
};

exports.init = (sourceConfig, blacklist, blacklistedDistricts) => {
    config.enabled = sourceConfig.enabled;
    config.url = sourceConfig.url;
    appliedBlacklistedDistricts = blacklistedDistricts;
    appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'kleinanzeigen';

exports.config = config;

