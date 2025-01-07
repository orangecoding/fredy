import { setDebug } from './utils.js';
import puppeteerExtractor from './puppeteerExtractor.js';
import { loadParser, parse } from './parser/parser.js';

const DEFAULT_OPTIONS = {
  debug: false,
  puppeteerTimeout: 60_000,
  puppeteerHeadless: true,
};

export default class Extractor {
  constructor(options) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.responseText = null;
    setDebug(this.options);
  }

  /**
   * if you are extracting data from a SPA, you must provide a selector, otherwise
   * your response will never contain what you are really looking for
   * @param url
   * @param waitForSelector
   */
  execute = async (url, waitForSelector = null) => {
    this.responseText = null;
    try {
      this.responseText = await puppeteerExtractor(url, waitForSelector, this.options);
      if (this.responseText != null) {
        loadParser(this.responseText);
      }
    } catch (error) {
      console.error('Error trying to load page.', error);
    }
    return this;
  };

  parseResponseText = (crawlContainer, crawlFields, url) => {
    return parse(crawlContainer, crawlFields, this.responseText, url);
  };
}
