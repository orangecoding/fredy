import * as cheerio from 'cheerio';

let $ = null;

export function loadParser(text) {
    $ = cheerio.load(text);
}


export function parse(crawlContainer, crawlFields, text) {
    if (!text) {
        console.warn('Cannot parse, text was empty.');
        return null;
    }

    if (!crawlContainer || !crawlFields) {
        console.warn('Cannot parse, selector was empty.');
        return null;
    }

    const result = [];

    if ($(crawlContainer).length === 0) {
        console.error('No elements in crawl container found!');
    }

    $(crawlContainer).each((_, element) => {
        const container = $(element);
        const parsedObject = {};

        // Parse fields based on crawlFields
        for (const [key, fieldSelector] of Object.entries(crawlFields)) {
            let value;

            // Validate and normalize selector
            const normalizedSelector = normalizeSelector(fieldSelector);
            if (!normalizedSelector) {
                console.warn(`Invalid or unsupported selector: ${fieldSelector}`);
                continue;
            }

            try {

                const selector = normalizedSelector.includes('|') ? normalizedSelector.substring(0, normalizedSelector.indexOf('|')).trim() : normalizedSelector;

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
                    const [_, ...modifiers] = fieldSelector.split('|').map(s => s.trim());
                    value = applyModifiers(value, modifiers);
                }

                parsedObject[key] = value || null;
            } catch (error) {
                console.error(`Error parsing field '${key}' with selector '${normalizedSelector}':`, error);
                parsedObject[key] = null;
            }
        }

        if (parsedObject.id != null) {
            console.warn('ID not found. Not relaying object.');
            result.push(parsedObject);
        }
    });

    return result;
}

// Helper function to normalize selectors
function normalizeSelector(selector) {
    if (!selector) return null;

    // Remove namespaced tags or unsupported formats
    if (selector.includes(':')) {
        console.warn(`Selector contains unsupported namespace: ${selector}`);
        //  return null;
    }

    return selector;
}

// Helper function to apply modifiers
function applyModifiers(value, modifiers) {
    if (!value) return value;

    modifiers.forEach(modifier => {
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

