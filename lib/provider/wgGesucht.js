const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
  return o;
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, config.blacklist);
  const descNotBlacklisted = !utils.isOneOf(o.description, config.blacklist);


  return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

const wgGesucht = {
  name: 'wgGesucht',
  enabled: config.sources.wgGesucht.enabled,
  url: config.sources.wgGesucht.url,
  crawlContainer: '#main_column .panel:not(.display-none):not(.noprint)',
  crawlFields: {
    id: '@data-id',
    details: ' .list-details-costs-col |removeNewline |trim',
    title: '.headline .detailansicht |removeNewline |trim',
    description: '.list-details-category-location |removeNewline |trim',
    link: '.headline .detailansicht@href'
  },
  paginate: '.pagination-sm:first a:last@href',
  normalize: normalize,
  filter: applyBlacklist
};

module.exports = new Fredy(wgGesucht);
