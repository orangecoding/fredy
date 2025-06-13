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
   * Extract text from JSON using JSONPath selectors
   * @param {Object} json - The JSON data to parse
   * @param {Array} selectors - Array of JSONPath selectors
   * @returns {string} The extracted text
   */
  _extractTextFromJson(json, selectors) {
    if (!Array.isArray(selectors)) return '';
    
    return selectors
      .map(selector => {
        try {
          const results = jsonpath.query(json, selector);
          if (Array.isArray(results)) {
            return results
              .map(result => {
                if (typeof result === 'object' && result !== null) {
                  // Handle attribute lists
                  if (Array.isArray(result)) {
                    return result
                      .map(attr => `${attr.label}: ${attr.text}`)
                      .join('\n');
                  }
                  // Handle text areas
                  return result.text || '';
                }
                return String(result);
              })
              .filter(Boolean)
              .join('\n');
          }
          return String(results);
        } catch (error) {
          console.error(`Error extracting with selector ${selector}:`, error);
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Process an expose URL and extract information
   * @param {string} url - The expose URL
   * @param {Object} provider - The provider configuration
   * @param {string} jobId - The ID of the job being processed
   * @returns {Promise<Object>} The enhanced listing data
   * @throws {Error} If no response is received from the website
   */
  async processExpose(url, provider, jobId) {
    await this.execute(url, provider.waitForSelector);
    if (!this.responseText) {
      throw new Error(`No response received from ${url}`);
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
    const enhancedData = await ChatGPTExtractor.extract(context, customFields);

    // 4. Return enhanced listing data
    return enhancedData;
  }
} 