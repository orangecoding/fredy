const utils = require('../utils');

let appliedBlackList = [];

function normalize(o) {
    return o;
}

function applyBlacklist(o) {
    const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
    const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

    return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

const config = {
    enabled: null,
    url: null,
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

exports.init = (sourceConfig, blacklist, blacklistedDistricts) => {
    config.enabled = sourceConfig.enabled;
    config.url = sourceConfig.url;
    appliedBlackList = blacklist;
};

//must match the id of the source given in the config!
exports.id = () => 'wgGesucht';

exports.config = config;

