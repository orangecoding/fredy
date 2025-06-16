import * as cheerio from 'cheerio';
import jsonpath from 'jsonpath';

let $ = null;

export function loadParser(text) {
  $ = cheerio.load(text);
}

export function parse(crawlContainer, crawlFields, text, url) {
  if (!text) {
    console.warn('No content found for ', url);
    return null;
  }

  if (!crawlContainer || !crawlFields) {
    console.warn('Cannot parse, selector was empty for url ', url);
    return null;
  }

  const result = [];

  if ($(crawlContainer).length === 0) {
    console.warn('No elements in crawl container found for url ', url);
    return null;
  }

  $(crawlContainer).each((_, element) => {
    const container = $(element);
    const parsedObject = {};

    // Parse fields based on crawlFields
    for (const [key, fieldSelector] of Object.entries(crawlFields)) {
      let value;

      try {
        const selector = fieldSelector.includes('|')
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
        if (fieldSelector.includes('|')) {
          /* eslint-disable no-unused-vars */
          const [_, ...modifiers] = fieldSelector.split('|').map((s) => s.trim());
          /* eslint-disable no-unused-vars */
          value = applyModifiers(value, modifiers);
        }

        parsedObject[key] = value || null;
      } catch (error) {
        console.error(`Error parsing field '${key}' with selector '${fieldSelector}':`, error);
        parsedObject[key] = null;
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

// Helper function to apply modifiers
function applyModifiers(value, modifiers) {
  if (!value) return value;

  modifiers.forEach((modifier) => {
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

// New function: extract and concatenate text from selectors
export function extractTextFromSelectors(html, selectors) {
  const $ = cheerio.load(html);
  let result = '';
  selectors.forEach(selector => {
    $(selector).each((_, el) => {
      result += $(el).text().trim() + '\n\n';
    });
  });
  return result.trim();
}

/**
 * Extract text from JSON using JSONPath selectors
 * @param {Object} json - The JSON data to parse
 * @param {Array} selectors - Array of JSONPath selectors
 * @returns {string} The extracted text
 */
export function extractTextFromJson(json, selectors) {
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
                    .map(attr => attr.text) // Only get the text value
                    .filter(Boolean)
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
