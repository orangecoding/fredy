/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { PdfReadError, readPdfText } from '../../../lib/services/listings/pdfText.js';
import { buildPdf } from '../../mocks/buildPdf.js';

describe('readPdfText', () => {
  it('reads every page with its lines', async () => {
    const pdf = buildPdf([['Exposé', 'Kaltmiete 950 EUR'], ['Grundriss (siehe Anlage)']]);

    const result = await readPdfText(pdf);

    expect(result).toEqual({
      totalPages: 2,
      pages: [
        { number: 1, text: 'Exposé\nKaltmiete 950 EUR' },
        { number: 2, text: 'Grundriss (siehe Anlage)' },
      ],
      cut: false,
      nextPage: null,
    });
  });

  it('starts at the page asked for', async () => {
    const pdf = buildPdf([['one'], ['two'], ['three']]);

    const result = await readPdfText(pdf, { fromPage: 2 });

    expect(result.pages.map((page) => page.number)).toEqual([2, 3]);
    expect(result.nextPage).toBeNull();
  });

  it('stops before the page that would overrun the budget and says where to go on', async () => {
    const pdf = buildPdf([['a'.repeat(40)], ['b'.repeat(40)], ['c'.repeat(40)]]);

    const result = await readPdfText(pdf, { maxChars: 90 });

    expect(result.pages.map((page) => page.number)).toEqual([1, 2]);
    expect(result.cut).toBe(false);
    expect(result.nextPage).toBe(3);
  });

  it('cuts a single page that is longer than the whole budget', async () => {
    const pdf = buildPdf([['x'.repeat(100)], ['y']]);

    const result = await readPdfText(pdf, { maxChars: 30 });

    expect(result.pages).toEqual([{ number: 1, text: 'x'.repeat(30) }]);
    expect(result.cut).toBe(true);
    expect(result.nextPage).toBe(2);
  });

  it('gives a page without a text layer as empty text', async () => {
    const result = await readPdfText(buildPdf([[], ['text']]));

    expect(result.pages).toEqual([
      { number: 1, text: '' },
      { number: 2, text: 'text' },
    ]);
  });

  it('reads nothing past the end of the document', async () => {
    const result = await readPdfText(buildPdf([['only page']]), { fromPage: 4 });

    expect(result).toEqual({ totalPages: 1, pages: [], cut: false, nextPage: null });
  });

  it('refuses bytes that only claim to be a PDF', async () => {
    await expect(readPdfText(Buffer.from('%PDF-1.7 not really'))).rejects.toBeInstanceOf(PdfReadError);
  });

  it('leaves the buffer it was given intact', async () => {
    const pdf = buildPdf([['keep me']]);
    const copy = Buffer.from(pdf);

    await readPdfText(pdf);

    expect(pdf.equals(copy)).toBe(true);
  });
});
