const { metaInformation } = require('../provider/immoscout');
//to better configure re-capture chose a random proxy each time we do a call
const config = require('../../conf/config.json');

const isImmoscout = (id) => {
  return id.toLowerCase() === metaInformation.id;
};

exports.transformUrlForScrapingAnt = (url, id) => {
  if (isImmoscout(id)) {
    //only do calls to scrapingAnt when dealing with Immoscout
    url = `https://api.scrapingant.com/v1/general?url=${encodeURIComponent(url)}&proxy_type=datacenter`;
  }
  return url;
};

exports.isScrapingAntApiKeySet = () => {
  return config.scrapingAnt != null && config.scrapingAnt.apiKey != null && config.scrapingAnt.apiKey.length > 0;
};

exports.isImmoscout = isImmoscout;

exports.makeUrlResidential = (url) => {
  return url.replace('datacenter', 'residential');
};
