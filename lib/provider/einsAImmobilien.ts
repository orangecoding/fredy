import { Listing } from '#types/Listings.ts';
import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import utils, { buildHash } from '../utils';

let appliedBlackList: string[] = [];

const normalize = (o: Listing): Listing => {
  const normalizePrice = (price: string | undefined) => {
    if (price === null || price === undefined) return null;
    const regex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s?(EUR|€)/g;
    const result = price.match(regex);
    if (result === null || result.length === 0) return price;
    return result[0];
  };
  const price = normalizePrice(o.price);
  const id = buildHash(o.id, price);
  const link = `https://www.1a-immobilienmarkt.de/expose/${o.id}.html`;
  return Object.assign(o, { id, price, link });
};

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: '.tabelle',
  sortByDateParam: 'sort_type=newest',
  waitForSelector: 'body',
  crawlFields: {
    id: '.inner_object_data input[name="marker_objekt_id"]@value | int',
    price: '.inner_object_data .single_data_price | removeNewline | trim',
    size: '.tabelle .tabelle_inhalt_infos .single_data_box  | removeNewline | trim',
    title: '.inner_object_data .tabelle_inhalt_titel_black | removeNewline | trim',
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
  name: '1a Immobilien',
  baseUrl: 'https://www.1a-immobilienmarkt.de/',
  id: 'einsAImmobilien',
};

export { config, metaInformation, init };
