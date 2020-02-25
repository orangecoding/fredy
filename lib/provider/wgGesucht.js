const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
  return o;
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

  return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  enabled: null,
  url: null,
  crawlContainer: '#main_column .wgg_card',
  crawlFields: {
    id: '@data-id',
    details: '.row .noprint .col-xs-11 |removeNewline |trim',
    price: '.middle .col-xs-3 |removeNewline |trim',
    size: '.middle .text-right |removeNewline |trim',
    title: '.truncate_title a |removeNewline |trim',
    link: '.truncate_title a@href'
  },
  paginate: '.pagination-sm:first a:last@href',
  normalize: normalize,
  filter: applyBlacklist
};

exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'wgGesucht';

exports.config = config;
