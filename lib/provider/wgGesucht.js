import utils, {buildHash} from '../utils.js';
import { DEFAULT_HEADER } from '../services/extractor/utils.js';

let appliedBlackList = [];

function normalize(o) {
    const id = buildHash(o.id, o.price);
    const link = `https://www.wg-gesucht.de${o.link}`;
    return Object.assign(o, { id, link });
}

function applyBlacklist(o) {
    const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
    const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
    return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

function getExposeConfig(expose) {
    return {
        url: expose.link,
        headers: DEFAULT_HEADER,
        waitForSelector: 'div#main-content'
    };
}

function getExposeSelectors() {
    return [
        'h1.headline-detailed-view-title',
        'div.section_footer_dark',
        'div.section_panel:nth-of-type(1)',
        'div.section_panel:nth-of-type(2)',
        'div.section_panel:nth-of-type(3)',
        'div.section_panel:nth-of-type(4)',
        'div.section_panel:nth-of-type(5)',
        'div.section_panel:nth-of-type(6)',
        'div.section_panel:nth-of-type(7)',
    ];
  }

const config = {
    id: 'wgGesucht',
    url: null,
    crawlContainer: '#main_column .wgg_card',
    sortByDateParam: 'sort_column=0&sort_order=0',
    waitForSelector: 'body',
    crawlFields: {
        id: '@data-id',
        details: '.row .noprint .col-xs-11 |removeNewline |trim',
        price: '.middle .col-xs-3 |removeNewline |trim',
        size: '.middle .text-right |removeNewline |trim',
        title: '.truncate_title a |removeNewline |trim',
        link: '.truncate_title a@href',
    },
    normalize: normalize,
    filter: applyBlacklist,
    getExposeConfig: getExposeConfig,
    getExposeSelectors: getExposeSelectors
};
export const init = (sourceConfig, blacklist) => {
    config.enabled = sourceConfig.enabled;
    config.url = sourceConfig.url;
    appliedBlackList = blacklist || [];
};
export const metaInformation = {
    name: 'Wg gesucht',
    baseUrl: 'https://www.wg-gesucht.de/',
    id: 'wgGesucht',
};
export {config};
