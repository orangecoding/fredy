const { metaInformation } = require('../provider/immoscout');
//to better confure re-capture chose a random proxy each time we do a call
const proxies = ['ae', 'br', 'cn', 'de', 'es', 'fr', 'gb', 'hk', 'in', 'it', 'il', 'jp', 'nl', 'ru', 'sa', 'us', 'cz'];
const config = require('../../conf/config.json');

const isImmoscout = (id) => {
  return id.toLowerCase() === metaInformation.id;
};

exports.transformUrlForScrapingAnt = (url, id) => {
  const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];

  if (isImmoscout(id)) {
    //only do calls to scrapingAnt when dealing with Immoscout
    url = `https://api.scrapingant.com/v1/general?url=${encodeURIComponent(url)}&proxy_country=${randomProxy}`;
  }
  return url;
};

exports.isScrapingAntApiKeySet = () => {
  return config.scrapingAnt != null && config.scrapingAnt.apiKey != null && config.scrapingAnt.apiKey.length > 0;
};

exports.isImmoscout = isImmoscout;
