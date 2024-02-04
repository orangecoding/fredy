import utils from '../utils.js';
import { Listing, ProviderConfig, ProviderJobInformation } from './provider.js';
let appliedBlackList = [];
function normalize(o: Listing): Listing {
  return o;
}
function applyBlacklist(o: Listing): boolean {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config: ProviderConfig = {
  url: null,
  crawlContainer: "div[class^='EstateItem-']",
  sortByDateParam: 'sd=DESC&sf=TIMESTAMP',
  crawlFields: {
    id: 'a@id',
    price: "div[class^='KeyFacts-'] [data-test='price'] | removeNewline | trim",
    size: "div[class^='KeyFacts-'] [data-test='area'] | removeNewline | trim",
    title: "div[class^='FactsMain-'] h2",
    link: 'a@href',
    address: "div[class^='estateFacts-'] span | removeNewline | trim",
  },
  paginate: '#pnlPaging #nlbPlus@href',
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig: ProviderJobInformation, blacklist) => {
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immowelt',
  baseUrl: 'https://www.immowelt.de/',
  id: 'immowelt',
};
export { config };
