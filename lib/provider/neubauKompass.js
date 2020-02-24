const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
  return o;
}

function applyBlacklist(o) {
  return !utils.isOneOf(o.title, appliedBlackList);
}

const config = {
  enabled: null,
  url: null,
  crawlContainer: '.row article',
  crawlFields: {
    id: '@id',
    title: 'div.nbk-p-2 > h3 a@title | removeNewline | trim',
    link: 'div.nbk-p-2 > h3 > a@href',
    address: 'div.nbk-p-2 > p | removeNewline | trim'
  },
  paginate: '.numbered-pager__bottom .numbered-pager--info li:nth-child(2) a@href',
  normalize: normalize,
  filter: applyBlacklist
};

exports.init = (sourceConfig, blacklist, blacklistedDistricts) => {
    config.enabled = sourceConfig.enabled;
    config.url = sourceConfig.url;
    appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'neubauKompass';

exports.config = config;

