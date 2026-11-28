/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reading the text of a PDF a user attached to a listing.
 *
 * MCP clients do not reliably pass a binary PDF on to the model (Claude Desktop drops embedded
 * resources, Claude Code writes them to disk), so the MCP document tool hands over the text instead.
 * An exposé is mostly text anyway.
 *
 * pdf.js (through unpdf, its serverless build without a worker) is imported on first use, so neither
 * the web server nor the stdio MCP server loads it until somebody actually asks for a document.
 */

/**
 * @typedef {Object} PdfPageText
 * @property {number} number One-based page number.
 * @property {string} text The page's text, whitespace collapsed. Empty for a page without a text
 *   layer, which usually means it is a scan.
 */

/**
 * @typedef {Object} PdfText
 * @property {number} totalPages Pages in the whole document.
 * @property {PdfPageText[]} pages The pages read, in order, starting at the page asked for. Empty
 *   when the document is shorter than that.
 * @property {boolean} cut True when the last page in `pages` was cut off at the character budget.
 * @property {number|null} nextPage The first page not read, or null when the document was read to
 *   its end.
 */

/**
 * Thrown when the text of a PDF cannot be read. The message is meant for the user.
 */
export class PdfReadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PdfReadError';
  }
}

/**
 * Collapse runs of spaces without losing the line structure, like unpdf's own merge does.
 *
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The text of one page, lines kept.
 *
 * @param {object} pdf The pdf.js document.
 * @param {number} number One-based.
 * @returns {Promise<string>}
 */
async function pageText(pdf, number) {
  const page = await pdf.getPage(number);
  try {
    const { items } = await page.getTextContent();
    return tidy(
      items
        .filter((item) => item.str != null)
        .map((item) => item.str + (item.hasEOL ? '\n' : ''))
        .join(''),
    );
  } finally {
    page.cleanup();
  }
}

/**
 * Read the text of a PDF, page by page, until the character budget is spent.
 *
 * Pages are read whole and in order from `fromPage`; the first page that would overrun the budget is
 * where the reading stops, so the caller can continue from `nextPage`. A single page larger than the
 * whole budget is the one exception: it is cut off, and `cut` says so. Pages past the budget are never
 * parsed, which keeps a long document from occupying the event loop for the part nobody asked for.
 *
 * @param {Buffer} buffer The PDF's bytes.
 * @param {Object} [options]
 * @param {number} [options.fromPage=1] One-based page to start at.
 * @param {number} [options.maxChars=Infinity] Characters of page text to return at most.
 * @returns {Promise<PdfText>}
 * @throws {PdfReadError} When the PDF is broken or protected by a password.
 */
export async function readPdfText(buffer, { fromPage = 1, maxChars = Infinity } = {}) {
  const { getDocumentProxy } = await import('unpdf');

  let pdf;
  try {
    // A copy, because pdf.js may take ownership of the array it is given, and the buffer belongs
    // to the caller. Verbosity 0 keeps pdf.js from writing its warnings to the console.
    pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new PdfReadError('The PDF is protected by a password, so its text cannot be read.');
    }
    throw new PdfReadError(`The PDF cannot be read: ${error?.message ?? 'unknown error'}`);
  }

  try {
    const totalPages = pdf.numPages;
    const pages = [];
    let used = 0;
    let cut = false;
    let number = fromPage;
    for (; number <= totalPages; number++) {
      const text = await pageText(pdf, number);
      if (used + text.length > maxChars) {
        if (pages.length === 0) {
          pages.push({ number, text: text.slice(0, maxChars) });
          cut = true;
          number++;
        }
        break;
      }
      pages.push({ number, text });
      used += text.length;
    }

    return { totalPages, pages, cut, nextPage: number <= totalPages ? number : null };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
