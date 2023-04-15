import fetch from 'node-fetch';
import { config } from '../utils.js';
import { makeUrlResidential } from './scrapingAnt.js';
import https from 'https';
//if ScrapingAnt got blocked, this http status is returned
const BLOCKED_HTTP_STATUS = 423;
const NOT_FOUND_HTTP_STATUS = 404;
const MAX_RETRIES_SCRAPING_ANT = 10;
const EXPECTED_STATUS_CODES = [BLOCKED_HTTP_STATUS, NOT_FOUND_HTTP_STATUS];
const agent = new https.Agent({
  rejectUnauthorized: false,
});

function makeDriver(headers = {}) {
  let cookies = '';
  async function scrapingAntDriver(context, callback, retryCounter = 0) {
    const proxyType = config.scrapingAnt?.proxy || 'datacenter';
    try {
      const url = proxyType === 'residential' ? makeUrlResidential(context.url) : context.url;
      const response = await fetch(url, {
        headers: {
          ...headers,
          cookie: cookies,
        },
      });
      const result = await response.text();
      if (cookies.length === 0) {
        cookies = response.headers.raw()['set-cookie'] || [];
      }
      callback(null, result);
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
   * everything != Immoscout & Immonet as of writing this)
   */
  return async function driver(context, callback) {
    if (context.url.toLowerCase().indexOf('scrapingant') !== -1) {
      return scrapingAntDriver(context, callback);
    }
    try {
      const response = await fetch(context.url, {
        headers: {
          ...headers,
          Cookie: cookies,
        },
        agent,
      });
      const result = await response.text();
      callback(null, result);
    } catch (exception) {
      console.error(`Error while trying to scrape data. Received error: ${exception.message}`);
      callback(null, []);
    }
  };
}
export default makeDriver;
