import utils, { buildHash } from '../utils';
import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import { Listing } from '#types/Listings';

let appliedBlackList: string[] = [];

function normalize(o: Listing): Listing {
  const size = o.size || 'N/A m²';
  const price = (o.price || 'N/A €').replace('Preis auf Anfrage', 'N/A €');
  const title = o.title || 'N/A';
  const immoId = (o.id as string).substring((o.id as string).indexOf('-') + 1);
  const link = `https://immo.swp.de/immobilien/${immoId}`;
  const description = o.description || null;
  const hash = buildHash(immoId, price);
  const id = hash ?? 'NO_ID';

  return Object.assign(o, { id, price, size, title, link, description });
}

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: '.js-serp-item',
  sortByDateParam: 's=most_recently_updated_first',
  waitForSelector: 'body',
  crawlFields: {
    id: '.js-bookmark-btn@data-id',
    price: 'div.align-items-start div:first-child | trim',
    size: 'div.align-items-start div:nth-child(3) | trim',
    title: '.card-title h2 | trim',
    link: '.ci-search-result__link@href',
    description: '.js-show-more-item-sm | removeNewline | trim',
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
  name: 'Immo Südwest Presse',
  baseUrl: 'https://immo.swp.de/',
  id: 'immoswp',
};

export { config, init, metaInformation };
