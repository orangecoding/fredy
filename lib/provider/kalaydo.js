const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
  const id = o.id
    .split('/')
    .filter(Boolean)
    .reverse()[0];
  const price = o.price.replace('Preis: ', '');
  let size = o.size.replace('Wohnfläche: ', '').replace('ca. ', '');
  size += ' / ' + o.rooms;
  const address = '---';

  return Object.assign(o, { id, price, size, address });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, config.blacklist);
  const descNotBlacklisted = !utils.isOneOf(o.description, config.blacklist);

  const isBlacklistedDistrict =
    config.blacklistedDistrics.length === 0 ? false : utils.isOneOf(o.title, config.blacklistedDistrics);

  return !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

const kalaydo = {
  name: 'kalaydo',
  enabled: config.sources.kalaydo.enabled,
  url: config.sources.kalaydo.url,
  crawlContainer: '#resultList .resultitem-content-container',
  crawlFields: {
    id: '.resultitem-content-container a@href',
    price: '.clear-row .rent | removeNewline | trim',
    title: '.resultitem-content-container a@title',
    link: '.resultitem-content-container a@href',
    rooms: '.resultitem-content-container .no-of-rooms | removeNewline  | trim',
    size: '.resultitem-content-container .living-area | removeNewline | trim'
  },
  paginate: '.markt_pagination_pageLinkNext .markt_pagination_link@href',
  normalize: normalize,
  filter: applyBlacklist
};

module.exports = new Fredy(kalaydo);
