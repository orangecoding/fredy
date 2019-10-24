const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
  return o;
}

function applyBlacklist(o) {
  return !utils.isOneOf(o.title, config.blacklist);
}

const neubauKompass = {
  name: 'neubauKompass',
  enabled: config.sources.neubauKompass.enabled,
  url: config.sources.neubauKompass.url,
  crawlContainer: '.row article',
  crawlFields: {
    id: '@id',
    title: 'div.p-2 > a@title | removeNewline | trim',
    link: 'div.p-2 > a@href',
    address: 'div.p-2 > p | removeNewline | trim'
  },
  paginate: '.numbered-pager__bottom .numbered-pager--info li:nth-child(2) a@href',
  normalize: normalize,
  filter: applyBlacklist
};

module.exports = new Fredy(neubauKompass);
