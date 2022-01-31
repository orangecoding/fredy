const axios = require('axios');
const axiosRetry = require('axios-retry');

axiosRetry(axios, { retryDelay: axiosRetry.exponentialDelay, retries: 3 });

function makeDriver(headers = {}) {
  let cookies = '';

  return async function driver(context, callback) {
    try {
      const url = context.url;
      const result = await axios({
        url,
        headers: {
          ...headers,
          Cookie: cookies,
        },
      });

      if (typeof result.data === 'object' && url.toLowerCase().indexOf('scrapingant') !== -1) {
        //assume we have gotten a response from scrapingAnt
        if (cookies.length === 0) {
          cookies = result.data.cookies;
        }
        callback(null, result.data.content);
      } else {
        callback(null, result.data);
      }
    } catch (exception) {
      console.error(`Error while trying to scrape data. Received error: ${exception.message}`);
      callback(null, []);
    }
  };
}

module.exports = makeDriver;
