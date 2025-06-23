import utils, {buildHash} from '../utils/utils.js';
import { DEFAULT_HEADER } from '../services/extractor/utils.js';

let appliedBlackList = [];
let appliedBlacklistedDistricts = [];

function normalize(o) {
    const size = o.size || '--- m²';
    const id = buildHash(o.id, o.price);
    const link = `https://www.kleinanzeigen.de${o.link}`;
    return Object.assign(o, {id, size, link});
}

function applyBlacklist(o) {
    const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
    const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
    const isBlacklistedDistrict =
        appliedBlacklistedDistricts.length === 0 ? false : utils.isOneOf(o.description, appliedBlacklistedDistricts);
    return o.title != null && !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

function getExposeConfig(expose) {
  return {
    url: expose.link,
    headers: DEFAULT_HEADER,
    waitForSelector: 'div.site-base',
  };
}

function getExposeSelectors() {
  return [
      'h1#viewad-title',
      'h2#viewad-price', 
      'div#viewad-details',
      'span#viewad-locality',
      'div#viewad-configuration',
      'div#viewad-map',
      'div#viewad-description',
  ];
}

const config = {
    id: 'kleinanzeigen',
    url: null,
    crawlContainer: '#srchrslt-adtable .ad-listitem ',
    //sort by date is standard oO
    sortByDateParam: null,
    waitForSelector: 'body',
    crawlFields: {
        id: '.aditem@data-adid | int',
        price: '.aditem-main--middle--price-shipping--price | removeNewline | trim',
        size: '.aditem-main .text-module-end | removeNewline | trim',
        title: '.aditem-main .text-module-begin a | removeNewline | trim',
        link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
        description: '.aditem-main .aditem-main--middle--description | removeNewline | trim',
        address: '.aditem-main--top--left | trim | removeNewline',
    },
    normalize: normalize,
    filter: applyBlacklist,
    getExposeConfig: getExposeConfig,
    getExposeSelectors: getExposeSelectors
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
export {config};
