import { setDebug } from './utils';
import puppeteerExtractor from './puppeteerExtractor';
import { loadParser, parse } from './parser/parser';
import { GeneralSettings } from '#types/GeneralSettings.js';
import { Listing } from '#types/Listings';

export default class Extractor {
  options: GeneralSettings;
  responseText: string | null;
  /* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
  constructor(options: GeneralSettings | {}) {
    this.options = {
      workingHours: {
        from: null,
        to: null,
      },
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
  execute = async (url: string, waitForSelector: string | null = null) => {
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

  parseResponseText = (crawlContainer: string, crawlFields: Listing, url: string): Listing[] => {
    const parsedResult = parse(crawlContainer, crawlFields, this.responseText, url);
    return parsedResult == null ? [] : (parsedResult as Listing[]);
  };
}
