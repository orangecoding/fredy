import utils, { buildHash } from '../utils.js';

let appliedBlackList = [];

function nullOrEmpty(val) {
  return val == null || val.length === 0;
}

function normalize(o) {
  const link = nullOrEmpty(o.link)
    ? 'NO LINK'
    : `https://www.neubaukompass.de${o.link.substring(o.link.indexOf('/neubau'))}`;
  const id = buildHash(o.link, o.price);
  return Object.assign(o, { id, link });
}

function applyBlacklist(o) {
  return !utils.isOneOf(o.title, appliedBlackList);
}

const config = {
  url: null,
  crawlContainer: '.col-12.mb-4',
  sortByDateParam: 'Sortierung=Id&Richtung=DESC',
  waitForSelector: '.nbk-section',
  crawlFields: {
    id: 'a@href',
    title: 'a@title | removeNewline | trim',
    link: 'a@href',
    address: '.nbk-project-card__description | removeNewline | trim',
    price: '.nbk-project-card__spec-item .nbk-project-card__spec-value | removeNewline | trim',
  },
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Neubau Kompass',
  baseUrl: 'https://www.neubaukompass.de/',
  id: 'neubauKompass',
};
export { config };
