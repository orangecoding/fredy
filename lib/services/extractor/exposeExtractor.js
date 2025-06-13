import * as cheerio from 'cheerio';
import BaseExtractor from './baseExtractor.js';
import { loadParser, parse, extractTextFromSelectors, extractTextFromJson } from './parser/parser.js';
import { ChatGPTExtractor } from './prompter/chatgpt.js';
import * as jobStorage from '../storage/jobStorage.js';

export default class ExposeExtractor extends BaseExtractor {
  constructor(options) {
    super(options);
    this.chatGPTExtractor = new ChatGPTExtractor();
  }

  /**
   * Process an expose URL and extract information
   * @param {string} listing - The listing object
   * @param {Object} provider - The provider configuration
   * @param {string} jobId - The ID of the job being processed
   * @returns {Promise<Object>} The enhanced listing data
   * @throws {Error} If no response is received from the website
   */
  async processExpose(listing, provider, jobId) {
    // Get the proper URL and headers from the provider
    const exposeConfig = provider.getExposeConfig(listing);
    
    // Execute the request with the proper configuration
    await this.execute(exposeConfig.url, exposeConfig.waitForSelector || providerConfig.waitForSelector, exposeConfig.headers);
    if (!this.responseText) {
      throw new Error(`No response received from ${exposeConfig.url}`);
    }

    // 1. Extract context based on provider type
    const selectors = provider.getExposeSelectors();
    let context = '';
    
    if (provider.name === 'immoscout') {
      // Parse JSON response for ImmoScout
      const json = JSON.parse(this.responseText);
      context = extractTextFromJson(json, selectors);
    } else {
      // Parse HTML response for other providers
      if (Array.isArray(selectors)) {
        context = extractTextFromSelectors(this.responseText, selectors);
      } else if (selectors.selectors) {
        context = extractTextFromSelectors(this.responseText, selectors.selectors);
      }
    }

    // 2. Get job configuration and custom fields
    const job = jobStorage.getJob(jobId);
    const customFields = job?.customFields || [];

    // 3. Process with ChatGPT
    const enhancedData = await ChatGPTExtractor.extract(context, customFields, jobId);

    // 4. Return enhanced listing data
    return enhancedData;
  }
} 