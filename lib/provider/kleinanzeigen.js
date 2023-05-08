import utils from '../utils.js';
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
  url: null,
  crawlContainer: '#srchrslt-adtable .ad-listitem ',
  //sort by date is standard oO
  sortByDateParam: null,
  crawlFields: {
    id: '.aditem@data-adid | int',
    price: '.aditem-main--middle--price | removeNewline | trim',
    size: '.aditem-main .text-module-end span:nth-child(2) | removeNewline | trim',
    title: '.aditem-main .text-module-begin a | removeNewline | trim',
    link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
    description: '.aditem-main p:not(.text-module-end) | removeNewline | trim',
    address: '.aditem-main--top--left | trim | removeNewline',
  },
  paginate: '#srchrslt-pagination .pagination-next@href',
  normalize: normalize,
  filter: applyBlacklist,
};
export const metaInformation = {
  name: 'Ebay Kleinanzeigen',
  baseUrl: 'https://www.kleinanzeigen.de/',
  id: 'kleinanzeigen',
};
export const init = (sourceConfig, blacklist, blacklistedDistricts) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlacklistedDistricts = blacklistedDistricts || [];
  appliedBlackList = blacklist || [];
};
export { config };
