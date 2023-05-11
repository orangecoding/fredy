import { metaInformation as immoScoutInfo } from '../provider/immoscout.js';
import { metaInformation as immoNetInfo } from '../provider/immonet.js';
import { config } from '../utils.js';

const additionalImmonetUrlParams = `&wait_for_selector=.content-wrapper-tiles&js_snippet=${Buffer.from(
  'window.scrollTo(0,document.body.scrollHeight);'
).toString('base64')}`;

const needScrapingAnt = (id) => {
  return id.toLowerCase() === immoScoutInfo.id || id.toLowerCase() === immoNetInfo.id;
};
export const transformUrlForScrapingAnt = (url, id) => {
  let urlParams = '';
  if (needScrapingAnt(id)) {
    if (id.toLowerCase() === immoNetInfo.id) {
      urlParams = additionalImmonetUrlParams;
    }
    //only do calls to scrapingAnt when dealing with Immoscout/Immonet
    url = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&proxy_type=datacenter${urlParams}`;
  }
  return url;
};
export const isScrapingAntApiKeySet = () => {
  return config.scrapingAnt != null && config.scrapingAnt.apiKey != null && config.scrapingAnt.apiKey.length > 0;
};
export const makeUrlResidential = (url) => {
  return url.replace('datacenter', 'residential');
};
export { needScrapingAnt };
