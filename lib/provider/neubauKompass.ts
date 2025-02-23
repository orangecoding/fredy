import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import utils, { buildHash } from '../utils';
import { Listing } from '#types/Listings';
let appliedBlackList: string[] = [];

function normalize(o: Listing): Listing {
  o.link = o.link ?? 'N/A';
  const link = `https://www.neubaukompass.de${o.link.substring(o.link.indexOf('/neubau'))}`;
  const id = buildHash(o.link, o.price);
  return Object.assign(o, { id, link });
}

function filter(o: Listing) {
  return !utils.isOneOf(o.title, appliedBlackList);
}

const config: ProviderConfig = {
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
  normalize,
  filter,
  enabled: false,
};

const init = (sourceConfig: Partial<ProviderConfig>, blacklist: string[]) => {
  config.enabled = sourceConfig.enabled ?? false;
  config.url = sourceConfig.url ?? null;
  appliedBlackList = blacklist ?? [];
};

const metaInformation: ProviderMetaInformation = {
  name: 'Neubau Kompass',
  baseUrl: 'https://www.neubaukompass.de/',
  id: 'neubauKompass',
};

export { config, metaInformation, init };
