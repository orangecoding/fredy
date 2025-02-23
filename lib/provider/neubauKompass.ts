import utils, {buildHash} from '../utils.js';

let appliedBlackList: any = [];

function nullOrEmpty(val: any) {
    return val == null || val.length === 0;
}

function normalize(o: any) {
    const link = nullOrEmpty(o.link) ? 'NO LINK' : `https://www.neubaukompass.de${o.link.substring(o.link.indexOf('/neubau'))}`;
    const id = buildHash(o.link, o.price);
    return Object.assign(o, {id, link});
}

function applyBlacklist(o: any) {
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
export const init = (sourceConfig: any, blacklist: any) => {
    // @ts-expect-error TS(2339): Property 'enabled' does not exist on type '{ url: ... Remove this comment to see the full error message
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
