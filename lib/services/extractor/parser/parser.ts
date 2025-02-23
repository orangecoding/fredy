import * as cheerio from 'cheerio';

let $: any = null;

export function loadParser(text: any) {
  $ = cheerio.load(text);
}

export function parse(crawlContainer: any, crawlFields: any, text: any, url: any) {
  if (!text) {
    console.warn('Cannot parse, text was empty for url ', url);
    return null;
  }

  if (!crawlContainer || !crawlFields) {
    console.warn('Cannot parse, selector was empty for url ', url);
    return null;
  }

  const result: any = [];

  if ($(crawlContainer).length === 0) {
    console.warn('No elements in crawl container found for url ', url);
    return null;
  }

  $(crawlContainer).each((_: any, element: any) => {
    const container = $(element);
    const parsedObject = {};

    // Parse fields based on crawlFields
    for (const [key, fieldSelector] of Object.entries(crawlFields)) {
      let value;

      try {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        const selector = fieldSelector.includes('|')
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          ? fieldSelector.substring(0, fieldSelector.indexOf('|')).trim()
          : fieldSelector;

        if (selector.includes('@')) {
          const [sel, attr] = selector.split('@');
          if (sel.length === 0) {
            value = container.attr(attr.trim());
          } else {
            value = container.find(sel.trim()).attr(attr.trim());
          }
        } else {
          value = container.find(selector.trim()).text();
        }

        // Apply modifiers if specified
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        if (fieldSelector.includes('|')) {
          /* eslint-disable no-unused-vars */
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          const [_, ...modifiers] = fieldSelector.split('|').map((s: any) => s.trim());
          /* eslint-disable no-unused-vars */
          value = applyModifiers(value, modifiers);
        }

        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        parsedObject[key] = value || null;
      } catch (error) {
        console.error(`Error parsing field '${key}' with selector '${fieldSelector}':`, error);
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        parsedObject[key] = null;
      }
    }

    // @ts-expect-error TS(2339): Property 'id' does not exist on type '{}'.
    if (parsedObject.id != null) {
      result.push(parsedObject);
    } else {
      console.warn('ID not found. Not relaying object.');
    }
  });

  return result;
}

// Helper function to apply modifiers
function applyModifiers(value: any, modifiers: any) {
  if (!value) return value;

  modifiers.forEach((modifier: any) => {
    switch (modifier) {
      case 'int':
        value = parseInt(value, 10);
        break;
      case 'trim':
        value = value.replace(/\s+/g, ' ').trim();
        break;
      case 'removeNewline':
        value = value.replace(/\n/g, ' ');
        break;
      default:
        console.warn(`Unknown modifier: ${modifier}`);
    }
  });

  return value;
}
