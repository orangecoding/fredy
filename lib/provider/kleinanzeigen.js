const Fredy = require('../fredy');
const config = require('../../conf/config.json');
const utils = require('../utils');

function normalize(o) {
    const size = o.size || '--- m²';

    return Object.assign(o, {size});
}

function applyBlacklist(o) {
    const titleNotBlacklisted = !utils.isOneOf(o.title, config.blacklist);
    const descNotBlacklisted = !utils.isOneOf(o.description, config.blacklist);
    const isBlacklistedDistrict =
        config.blacklistedDistrics.length === 0 ? false : utils.isOneOf(o.description, config.blacklistedDistrics);

    return !isBlacklistedDistrict && titleNotBlacklisted && descNotBlacklisted;
}

const kleinanzeigen = {
    name: 'kleinanzeigen',
    enabled: config.sources.kleinanzeigen.enabled,
    url: config.sources.kleinanzeigen.url,
    crawlContainer: '#srchrslt-adtable .ad-listitem',
    crawlFields: {
        id: '.aditem@data-adid | int',
        price: '.aditem-details strong | removeNewline | trim',
        size: '.aditem-main .text-module-end span:nth-child(2) | removeNewline | trim',
        title: '.aditem-main .text-module-begin a | removeNewline | trim',
        link: '.aditem-main .text-module-begin a@href | removeNewline | trim',
        description: '.aditem-main p:not(.text-module-end) | removeNewline | trim',
        address: '.aditem-details | trim | removeNewline'
    },
    paginate: '#srchrslt-pagination .pagination-next@href',
    normalize: normalize,
    filter: applyBlacklist
};

module.exports = new Fredy(kleinanzeigen);
