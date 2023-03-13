import utils from '../utils.js';
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
  sortByDateParam: 'sd=DESC&sf=TIMESTAMP',
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
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
