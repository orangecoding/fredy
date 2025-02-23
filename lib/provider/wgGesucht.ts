import { ProviderConfig, ProviderMetaInformation } from '#types/ProviderConfig.js';
import utils, { buildHash } from '../utils';
import { Listing } from '#types/Listings';

let appliedBlackList: string[] = [];

function normalize(o: Listing): Listing {
  const id = buildHash(o.id, o.price);
  const link = `https://www.wg-gesucht.de${o.link ?? ''}`;
  return Object.assign(o, { id, link });
}

function filter(o: Listing) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return o.id != null && titleNotBlacklisted && descNotBlacklisted;
}

const config: ProviderConfig = {
  url: null,
  crawlContainer: '#main_column .wgg_card',
  sortByDateParam: 'sort_column=0&sort_order=0',
  waitForSelector: 'body',
  crawlFields: {
    id: '@data-id',
    price: '.middle .col-xs-3 |removeNewline |trim',
    size: '.middle .text-right |removeNewline |trim',
    title: '.truncate_title a |removeNewline |trim',
    link: '.truncate_title a@href',
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
  name: 'Wg gesucht',
  baseUrl: 'https://www.wg-gesucht.de/',
  id: 'wgGesucht',
};

export { config, metaInformation, init };
