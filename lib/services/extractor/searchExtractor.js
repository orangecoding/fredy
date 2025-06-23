import * as cheerio from 'cheerio';
import BaseExtractor from './baseExtractor.js';
import { loadParser, parse } from './parser/parser.js';

export default class SearchExtractor extends BaseExtractor {
  constructor(options) {
    super(options);
  }

  /**
   * Execute the search extraction
   * @param {string} url - The URL to fetch
   * @param {string} waitForSelector - Optional selector to wait for
   * @returns {Promise<SearchExtractor>} - Returns this for chaining
   */
  async execute(url, waitForSelector = null) {
    await super.execute(url, waitForSelector);
    if (this.responseText != null) {
      loadParser(this.responseText);
    }
    return this;
  }

  /**
   * Parse the response text using the provided selectors
   * @param {string} crawlContainer - The container selector
   * @param {Object} crawlFields - The field selectors
   * @param {string} url - The URL being processed
   * @returns {Array} The parsed results
   */
  parseResponseText(crawlContainer, crawlFields, url) {
    return parse(crawlContainer, crawlFields, this.responseText, url);
  }
} 