import utils, { buildHash } from '../utils';
import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import { Listing } from '#types/Listings';
let appliedBlackList: string[] = [];

function normalize(o: Listing): Listing {
  const shortenLink = (link: string) => link.substring(0, link.indexOf('?'));
  const parseId = (shortenedLink: string) => shortenedLink.substring(shortenedLink.lastIndexOf('/') + 1);
  const shortLink = shortenLink(o.link ?? 'N/A');
  const size = o.size || 'N/A m²';
  const price = o.price || 'N/A €';
  const title = o.title || 'N/A';
  const address = o.address || 'N/A';

  const hash = buildHash(parseId(shortLink), price);
  const id = hash !== null ? hash : 'NO_ID';

  const link = `https://www.immobilien.de/${shortLink}`;

  return Object.assign(o, { id, price, size, title, address, link });
}

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: '._ref',
  sortByDateParam: 'sort_col=*created_ts&sort_dir=desc',
  waitForSelector: 'body',
  crawlFields: {
    id: '@href', // will be transformed later
    price: '.list_entry .immo_preis .label_info',
    size: '.list_entry .flaeche .label_info | removeNewline | trim',
    title: '.list_entry .part_text h3 span',
    description: '.list_entry .description | trim',
    link: '@href',
    address: '.list_entry .place',
  },
  normalize,
  filter,
};

const init = (sourceConfig: Partial<ProviderConfig>, blacklist: string[]) => {
  config.enabled = sourceConfig.enabled ?? false;
  config.url = sourceConfig.url ?? null;
  appliedBlackList = blacklist ?? [];
};

const metaInformation: ProviderMetaInformation = {
  name: 'Immobilien.de',
  baseUrl: 'https://www.immobilien.de/',
  id: 'immobilienDe',
};

export { config, metaInformation, init };
