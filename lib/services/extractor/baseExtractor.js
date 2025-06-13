import { setDebug } from './utils.js';
import puppeteerExtractor from './puppeteerExtractor.js';

const DEFAULT_OPTIONS = {
  debug: false,
  puppeteerTimeout: 60_000,
  puppeteerHeadless: true,
};

export default class BaseExtractor {
  constructor(options) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.responseText = null;
    setDebug(this.options);
  }

  /**
   * Base method to fetch content from a URL using puppeteer
   * @param {string} url - The URL to fetch
   * @param {string} waitForSelector - Optional selector to wait for
   * @param {Object} headers - Optional headers to include in the request
   * @returns {Promise<BaseExtractor>} - Returns this for chaining
   */
  async execute(url, waitForSelector = null, headers = null) {
    this.responseText = null;
    try {
      this.responseText = await puppeteerExtractor(url, waitForSelector, this.options, headers);
    } catch (error) {
      console.error('Error trying to load page:', error);
      throw error;
    }
    return this;
  }

  /**
   * Get the raw response text
   * @returns {string|null} The response text
   */
  getResponseText() {
    return this.responseText;
  }
} 