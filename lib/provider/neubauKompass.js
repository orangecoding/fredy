const config = require('../../conf/config.json');
const Fredy = require('../fredy');
const utils = require('../utils');

function normalize(o) {
    const title = o.title + '| '+o.subTitle;
    //this is a bit nasty, but we do not have a size, therefor take the availability and set it as size to not modify notifications any furter
    const size = o.available;
    return Object.assign(o, { title, size });
}

function applyBlacklist(o) {
    return !utils.isOneOf(o.title, config.blacklist);
}

const neubauKompass = {
    name: 'neubauKompass',
    enabled: config.sources.neubauKompass.enabled,
    url: config.sources.neubauKompass.url,
    crawlContainer: '.md__property-list .post-list__item',
    crawlFields: {
        id: '@id',
        price: '.entry__main .entry__data li:nth-child(1) span:nth-child(2) | removeNewline | trim',
        available: '.entry__main .entry__data li:nth-child(3) span:nth-child(2) | removeNewline | trim',
        title: '.entry__main .entry__title | removeNewline | trim',
        link: '.entry__main .entry__title a@href',
        subTitle: '.entry__main .entry__subtitle | removeNewline | trim',
        address: '.entry__main .entry__info | removeNewline | trim'
    },
    paginate: '.numbered-pager__bottom .numbered-pager--info li:nth-child(2) a@href',
    normalize: normalize,
    filter: applyBlacklist
};

module.exports = new Fredy(neubauKompass);
