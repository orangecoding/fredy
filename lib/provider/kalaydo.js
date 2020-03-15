const utils = require('../utils');

let appliedBlackList = [];
let appliedBlacklistedDistricts = [];

function normalize(o) {
  const id = o.id
    .split('/')
    .filter(Boolean)
    .reverse()[0];
  const price = o.price == null ? 'unknown' : o.price.trim().replace('Preis', '');
  let size = o.size == null ? 'unknown' : o.size.replace('Wohnfläche: ', '').replace('ca. ', '');
  size += ' / ' + o.rooms;
  const address = '---';

  return Object.assign(o, { id, price, size, address });
}

function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

  const isBlacklistedDistrict =
    appliedBlacklistedDistricts.length === 0 ? false : utils.isOneOf(o.title, appliedBlacklistedDistricts);

  return !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  enabled: null,
  url: null,
  crawlContainer: '#resultList .resultitem-content-container',
  crawlFields: {
    id: '.resultitem-content-container a@href',
    price: '.description .rent | removeNewline | trim',
    title: '.resultitem-content-container a@title',
    link: '.resultitem-content-container a@href',
    rooms: '.resultitem-content-container .no-of-rooms | removeNewline  | trim',
    size: '.resultitem-content-container .living-area | removeNewline | trim'
  },
  paginate: '.markt_pagination_pageLinkNext .markt_pagination_link@href',
  normalize: normalize,
  filter: applyBlacklist
};

exports.init = (sourceConfig, blacklist, blacklistedDistricts) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist;
  appliedBlacklistedDistricts = blacklistedDistricts;
};

//must match the id of the source given in the config!
exports.id = () => 'kalaydo';

exports.config = config;
