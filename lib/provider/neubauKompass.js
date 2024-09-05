import utils, {buildHash} from '../utils.js';

let appliedBlackList = [];

function nullOrEmpty(val) {
    return val == null || val.length === 0;
}

function normalize(o) {
    const link = nullOrEmpty(o.link) ? 'NO LINK' : `https://www.neubaukompass.de${o.link.substring(o.link.indexOf('/neubau'))}`;
    const id = buildHash(o.id, o.price);
    return Object.assign(o, {id, link});
}

function applyBlacklist(o) {
    return !utils.isOneOf(o.title, appliedBlackList);
}

const config = {
    url: null,
    crawlContainer: '.nbk-container >div article',
    sortByDateParam: 'Sortierung=Id&Richtung=DESC',
    crawlFields: {
        id: '@id',
        title: 'a.nbk-truncate@title | removeNewline | trim',
        link: 'a.nbk-truncate@href',
        address: 'p.nbk-truncate | removeNewline | trim',
        price: 'p.nbk-mb-0 | removeNewline | trim',
    },
    paginate: '.numbered-pager__bottom .numbered-pager--info li:nth-child(2) a@href',
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
export {config};
