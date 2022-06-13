const axios = require('axios');
const config = require('../../conf/config.json');

const { makeUrlResidential } = require('./scrapingAnt');
//if ScrapingAnt got blocked, this http status is returned
const BLOCKED_HTTP_STATUS = 423;
const NOT_FOUND_HTTP_STATUS = 404;
const MAX_RETRIES_SCRAPING_ANT = 10;
const EXPECTED_STATUS_CODES = [BLOCKED_HTTP_STATUS, NOT_FOUND_HTTP_STATUS];

function makeDriver(headers = {}) {
  let cookies = '';

  async function scrapingAntDriver(context, callback, retryCounter = 0) {
    const proxyType = config.scrapingAnt?.proxy || 'datacenter';

    try {
      const url = proxyType === 'residential' ? makeUrlResidential(context.url) : context.url;
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
      if (!EXPECTED_STATUS_CODES.includes(exception.response?.status)) {
        console.error(`Error while trying to scrape data from scraping ant. Received error: ${exception.message}`);
        callback(null, []);
        return;
      }

      if (retryCounter <= MAX_RETRIES_SCRAPING_ANT) {
        retryCounter++;
        console.debug(`ScrapingAnt got blocked. Retrying ${retryCounter} / ${MAX_RETRIES_SCRAPING_ANT}`);
        await scrapingAntDriver(context, callback, retryCounter);
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
