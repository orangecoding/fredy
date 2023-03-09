import { metaInformation } from '../provider/immoscout.js';
import { config } from '../utils.js';
const isImmoscout = (id) => {
  return id.toLowerCase() === metaInformation.id;
};
export const transformUrlForScrapingAnt = (url, id) => {
  if (isImmoscout(id)) {
    //only do calls to scrapingAnt when dealing with Immoscout
    url = `https://api.scrapingant.com/v1/general?url=${encodeURIComponent(url)}&proxy_type=datacenter`;
  }
  return url;
};
export const isScrapingAntApiKeySet = () => {
  return config.scrapingAnt != null && config.scrapingAnt.apiKey != null && config.scrapingAnt.apiKey.length > 0;
};
export const makeUrlResidential = (url) => {
  return url.replace('datacenter', 'residential');
};
export { isImmoscout };
