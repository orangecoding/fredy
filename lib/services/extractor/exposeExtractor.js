import * as cheerio from 'cheerio';
import BaseExtractor from './baseExtractor.js';
import { loadParser, parse, extractTextFromSelectors, extractTextFromJson } from './parser/parser.js';
import { ChatGPTExtractor } from './prompter/chatgpt.js';
import * as jobStorage from '../storage/jobStorage.js';
import logger from '../../utils/logger.js';

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
    try {
      // Get the proper URL and headers from the provider
      const exposeConfig = provider.getExposeConfig(listing);
      
      if (provider.id === 'immoscout') {
        // For ImmoScout, use the getExpose function directly
        const exposeData = await provider.getExpose(exposeConfig.url, exposeConfig.headers);
        if (!exposeData) {
          throw new Error(`No expose data received from ImmoScout for URL: ${exposeConfig.url}`);
        }
        this.responseText = JSON.stringify(exposeData);
      } else {
        // Execute the request with the proper configuration
        await this.execute(exposeConfig.url, exposeConfig.waitForSelector || '', exposeConfig.headers);
      }

      // Validate response text
      if (!this.responseText || this.responseText.length === 0) {
        throw new Error(`No response received from ${exposeConfig.url}`);
      }
  
      // 1. Extract context based on provider type
      const selectors = provider.getExposeSelectors();
      let context = '';
      
      if (provider.id === 'immoscout') {
        // Parse JSON response for ImmoScout
        let json;
        try {
          json = JSON.parse(this.responseText);
        } catch (e) {
          throw new Error(`Invalid JSON response from ImmoScout: ${e.message}`);
        }
        context = extractTextFromJson(json, selectors);
      } else {
        // Parse HTML response for other providers
        if (Array.isArray(selectors)) {
          context = extractTextFromSelectors(this.responseText, selectors);
        } else if (selectors.selectors) {
          context = extractTextFromSelectors(this.responseText, selectors.selectors);
        }
      }

      // Validate context before calling ChatGPT
      if (!context || context.trim().length === 0) {
        throw new Error(`No valid context extracted from ${exposeConfig.url}`);
      }
  
      // 2. Get job configuration and custom fields
      const job = jobStorage.getJob(jobId);
      if (!job?.customFields?.length) {
        throw new Error(`No custom fields configured for job ${jobId}`);
      }
  
      // 3. Process with ChatGPT only if we have valid context
      let enhancedData = await ChatGPTExtractor.extract(context, job.customFields, jobId);
  
      // 4. Return enhanced listing data
      return enhancedData;
    } catch (error) {
      // Top-level error handler: log and return all custom fields as empty
      logger.error(`processExpose failed for listing ${listing.id}: ${error.message}`);
      const job = jobStorage.getJob(jobId);
      const customFields = job?.customFields || [];
      const fallback = {};
      for (const field of customFields) {
        fallback[String(field.id)] = "";
      }
      fallback._error = error.message;
      return fallback;
    }
  }
} 