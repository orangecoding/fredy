const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
    const title = o.title + '| '+o.subTitle;
    return Object.assign(o, { title });
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
        title: 'a@title | removeNewline | trim',
        link: 'a@href',
        subTitle: '.p-3 .mb-2 | removeNewline | trim',
        address: 'div.p-3 > p:nth-child(3) | removeNewline | trim'
    },
    paginate: '.numbered-pager__bottom .numbered-pager--info li:nth-child(2) a@href',
    normalize: normalize,
    filter: applyBlacklist
};

module.exports = new Fredy(neubauKompass);
