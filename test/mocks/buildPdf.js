/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Escape a string for a PDF literal string: backslash and both parentheses.
 *
 * @param {string} text
 * @returns {string}
 */
const escapePdfString = (text) => text.replace(/[\\()]/g, (char) => `\\${char}`);

/**
 * Build a small but real PDF, so text extraction is tested against pdf.js and not against a double.
 *
 * Every page is given as its lines; a page with no lines has no text layer, which is what a scanned
 * page looks like to a text extractor.
 *
 * @param {string[][]} pages The lines of each page, in order.
 * @returns {Buffer}
 */
export function buildPdf(pages) {
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  pages.forEach((lines, index) => {
    const stream =
      lines.length === 0
        ? ''
        : `BT /F1 12 Tf 14 TL 72 720 Td ${lines.map((line) => `(${escapePdfString(line)}) Tj T*`).join(' ')} ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
