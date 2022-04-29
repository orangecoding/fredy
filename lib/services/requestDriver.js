const axios = require('axios');

const { makeUrlResidential } = require('./scrapingAnt');
//if ScrapingAnt got blocked, this http status is returned
const BLOCKED_HTTP_STATUS = 423;
const MAX_RETRIES_SCRAPING_ANT = 3;

function makeDriver(headers = {}) {
  let cookies = '';

  async function scrapingAntDriver(context, callback, tryResidentialProxy, retryCounter = 0) {
    try {
      const url = context.url;
      const result = await axios({
        url,
        headers: {
          ...headers,
          Cookie: cookies,
        },
      });

      if (cookies.length === 0) {
        cookies = result.data.cookies;
      }

      callback(null, result.data.content);
    } catch (exception) {
      /* eslint-disable no-console */
      if (exception.response?.status !== BLOCKED_HTTP_STATUS) {
        console.error(`Error while trying to scrape data from scraping ant. Received error: ${exception.message}`);
        callback(null, []);
        return;
      }

      if (!tryResidentialProxy) {
        console.debug('ScrapingAnt got blocked out. Retrying with residential Proxy...');
        await scrapingAntDriver({ ...context, url: makeUrlResidential(context.url) }, callback, true, 0);
      } else if (retryCounter <= MAX_RETRIES_SCRAPING_ANT) {
        retryCounter++;
        console.debug(`ScrapingAnt still got blocked retry ${retryCounter} / ${MAX_RETRIES_SCRAPING_ANT}`);
        await scrapingAntDriver(
          {
            ...context,
            url: makeUrlResidential(context.url),
          },
          callback,
          true,
          retryCounter
        );
      } else {
        console.error(`Error while trying to scrape data from scraping ant. Received error: ${exception.message}`);
        callback(null, []);
      }
      /* eslint-enable no-console */
    }
  }

  /**
   * The regular request driver is taking care of everyting, that doesn't need to be scraped by ScrapingAnt (which is
   * everything != Immoscout as of writing this)
   */
  return async function driver(context, callback) {
    if (context.url.toLowerCase().indexOf('scrapingant') !== -1) {
      return scrapingAntDriver(context, callback);
    }

    try {
      const result = await axios({
        url: context.url,
        headers: {
          ...headers,
          Cookie: cookies,
        },
      });

      callback(null, result.data);
    } catch (exception) {
      console.error(`Error while trying to scrape data. Received error: ${exception.message}`);
      callback(null, []);
    }
  };
}

module.exports = makeDriver;
