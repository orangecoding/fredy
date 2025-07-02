import { Listing } from '#types/Listings';
import * as cheerio from 'cheerio';

let $: cheerio.CheerioAPI | null = null;

export function loadParser(text: string) {
  $ = cheerio.load(text);
}

export function parse(crawlContainer: string, crawlFields: Listing, text: string | null, url: string) {
  // Change return type
  if (!$) {
    console.warn('Parser not loaded, cannot parse');
    return null;
  }
  if (!text) {
    console.warn('No content found for ', url);
    return null;
  }

  if (!crawlContainer || !crawlFields) {
    console.warn('Cannot parse, selector was empty for url ', url);
    return null;
  }

  const result: Array<Partial<Listing>> = [];

  if ($(crawlContainer).length === 0) {
    console.warn('No elements in crawl container found for url ', url);
    return null;
  }

  $(crawlContainer).each((_, element) => {
    const container = $!(element);
    const parsedObject: Partial<Listing> = {};

    // Parse fields based on crawlFields
    for (const [key, fieldSelector] of Object.entries(crawlFields) as [keyof Listing, string][]) {
      let value: string | number | undefined;

      try {
        const selector = fieldSelector.includes('|')
          ? fieldSelector.substring(0, fieldSelector.indexOf('|')).trim()
          : fieldSelector;

        if (selector.includes('@')) {
          const parts = selector.split('@');
          const sel = parts[0]?.trim();
          const attr = parts[1]?.trim();

          if (sel === undefined || attr === undefined) {
            console.warn(`Invalid selector format for key '${key}': ${fieldSelector}`);
            continue;
          }

          if (sel.length === 0) {
            value = container.attr(attr);
          } else {
            value = container.find(sel).attr(attr);
          }
        } else {
          const sel = selector.trim();
          value = container.find(sel).text();
        }

        // Apply modifiers if specified
        if (fieldSelector.includes('|')) {
          const modifiers = fieldSelector
            .split('|')
            .map((s) => s.trim())
            .slice(1) as Array<'int' | 'trim' | 'removeNewline'>;
          value = applyModifiers(value, modifiers);
        }
        if (value == null || value === undefined) continue;
        if (typeof value === 'number') parsedObject[key] = String(value);
        else parsedObject[key] = value;
      } catch (error) {
        console.error(`Error parsing field '${key}' with selector '${fieldSelector}':`, error);
        continue;
      }
    }

    if (parsedObject.id != null) {
      result.push(parsedObject);
    } else {
      console.warn('ID not found. Not relaying object.');
    }
  });

  return result;
}

function applyModifiers(value: string | number | undefined, modifiers: Array<'int' | 'trim' | 'removeNewline'>) {
  if (value == null || value === undefined) return value;

  modifiers.forEach((modifier) => {
    switch (modifier) {
      case 'int':
        if (typeof value === 'string') value = parseInt(value, 10);
        else console.warn(`Cannot convert ${typeof value} to int (value: ${value})`);
        break;
      case 'trim':
        if (typeof value === 'string') value = value.replace(/\s+/g, ' ').trim();
        else console.warn(`Cannot trim ${typeof value} (value: ${value})`);
        break;
      case 'removeNewline':
        if (typeof value === 'string') value = value.replace(/\n/g, ' ');
        else console.warn(`Cannot remove newline from ${typeof value} (value: ${value})`);
        break;
      default:
        console.warn(`Unknown modifier: ${modifier}`);
    }
  });

  return value;
}
