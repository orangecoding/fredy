import utils, { buildHash } from '../utils.js';
let appliedBlackList = [];

function normalize(o) {
  const size = o.size != null ? o.size.replace('Wohnfläche ', '') : 'N/A m²';
  const price = o.price.replace('Kaufpreis ', '');
  const address = o.address?.split(' • ')?.pop() ?? null;
  const title = o.title || 'No title available';
  const link = o.link != null ? decodeURIComponent(o.link) : config.url;
  const id = buildHash(title, price);
  return Object.assign(o, { id, address, price, size, title, link });
}
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}
const config = {
  url: null,
  crawlContainer: 'div[data-testid="serp-core-classified-card-testid"]',
  sortByDateParam: 'sortby=19',
  waitForSelector: 'div[data-testid="serp-gridcontainer-testid"]',
  crawlFields: {
    id: 'button@title |trim',
    title: 'button@title |trim',
    price: 'div[data-testid="cardmfe-price-testid"] | trim',
    size: 'div[data-testid="cardmfe-keyfacts-testid"] | trim',
    address: 'div[data-testid="cardmfe-description-box-address"] | trim',
    image: 'div[data-testid="cardmfe-picture-box-test-id"] img@src',
    link: 'button@data-base',
  },
  normalize: normalize,
  filter: applyBlacklist,
};
export const init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};
export const metaInformation = {
  name: 'Immonet',
  baseUrl: 'https://www.immonet.de/',
  id: 'immonet',
};
export { config };
