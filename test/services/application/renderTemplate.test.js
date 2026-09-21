/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../../lib/services/application/renderTemplate.js';

describe('renderTemplate substitution', () => {
  it('replaces a placeholder with its value', () => {
    const { text } = renderTemplate('Hallo {{applicant.firstName}}!', { 'applicant.firstName': 'Max' });
    expect(text).toBe('Hallo Max!');
  });

  it('tolerates whitespace inside the braces', () => {
    const { text } = renderTemplate('Hallo {{ applicant.firstName }}!', { 'applicant.firstName': 'Max' });
    expect(text).toBe('Hallo Max!');
  });

  it('replaces every occurrence of the same placeholder', () => {
    const { text } = renderTemplate('{{a}} und {{a}}', { a: 'x' });
    expect(text).toBe('x und x');
  });
});

describe('renderTemplate fallbacks', () => {
  it('uses the fallback when the value is empty', () => {
    const { text } = renderTemplate('Sehr geehrte {{contact.name|Damen und Herren}},', { 'contact.name': '' });
    expect(text).toBe('Sehr geehrte Damen und Herren,');
  });

  it('prefers the value over the fallback', () => {
    const { text } = renderTemplate('Sehr geehrte {{contact.name|Damen und Herren}},', {
      'contact.name': 'Frau Muster',
    });
    expect(text).toBe('Sehr geehrte Frau Muster,');
  });

  it('does not report a placeholder as missing when its fallback covered it', () => {
    const { missing } = renderTemplate('{{contact.name|Damen und Herren}}', { 'contact.name': '' });
    expect(missing).toEqual([]);
  });
});

describe('renderTemplate line dropping', () => {
  it('drops a line whose only placeholder resolved empty, label and all', () => {
    const { text } = renderTemplate('Beruf: {{applicant.occupation}}\nStadt: {{applicant.city}}', {
      'applicant.occupation': '',
      'applicant.city': 'Hamburg',
    });
    expect(text).toBe('Stadt: Hamburg');
  });

  it('keeps a line when at least one of its placeholders resolved', () => {
    const { text } = renderTemplate('{{applicant.firstName}} {{applicant.lastName}}', {
      'applicant.firstName': '',
      'applicant.lastName': 'Mustermann',
    });
    expect(text).toBe('Mustermann');
  });

  it('never drops a line that holds no placeholder at all', () => {
    const { text } = renderTemplate('Mit freundlichen Grüßen', {});
    expect(text).toBe('Mit freundlichen Grüßen');
  });

  it('collapses the blank run a dropped line leaves behind', () => {
    const template = 'Guten Tag\n\nBeruf: {{a}}\n\nMit freundlichen Grüßen';
    const { text } = renderTemplate(template, { a: '' });
    expect(text).toBe('Guten Tag\n\nMit freundlichen Grüßen');
  });

  it('keeps a deliberate paragraph break between two surviving lines', () => {
    const { text } = renderTemplate('Eins\n\nZwei', {});
    expect(text).toBe('Eins\n\nZwei');
  });

  it('trims the ragged whitespace a removed placeholder leaves inside a line', () => {
    const { text } = renderTemplate('Wir sind {{a}} Personen, {{b}} davon Kinder.', { a: '2', b: '' });
    expect(text).toBe('Wir sind 2 Personen, davon Kinder.');
  });
});

describe('renderTemplate reporting', () => {
  it('reports placeholders that resolved empty and had no fallback', () => {
    const { missing } = renderTemplate('Beruf: {{applicant.occupation}}\nTel: {{applicant.phone}}', {
      'applicant.occupation': '',
      'applicant.phone': '',
    });
    expect(missing).toEqual(['applicant.occupation', 'applicant.phone']);
  });

  it('reports each missing placeholder once, in the order the template uses them', () => {
    const { missing } = renderTemplate('{{b}} {{a}} {{b}}', { a: '', b: '' });
    expect(missing).toEqual(['b', 'a']);
  });

  it('does not report placeholders that resolved', () => {
    const { missing } = renderTemplate('{{a}} {{b}}', { a: 'x', b: '' });
    expect(missing).toEqual(['b']);
  });

  it('leaves an unknown placeholder in the text and reports it separately', () => {
    const { text, unknown, missing } = renderTemplate('Hallo {{applicant.nachname}}', { 'applicant.lastName': 'M' });
    expect(text).toBe('Hallo {{applicant.nachname}}');
    expect(unknown).toEqual(['applicant.nachname']);
    expect(missing).toEqual([]);
  });

  it('does not drop a line because of an unknown placeholder, since it stays visible', () => {
    const { text } = renderTemplate('Beruf: {{typo}}', {});
    expect(text).toBe('Beruf: {{typo}}');
  });
});

describe('renderTemplate edge cases', () => {
  it('treats a whitespace-only value as empty', () => {
    const { text, missing } = renderTemplate('Beruf: {{a}}\nOrt: {{b}}', { a: '   ', b: 'Hamburg' });
    expect(text).toBe('Ort: Hamburg');
    expect(missing).toEqual(['a']);
  });

  it('treats null and undefined values as empty', () => {
    const { text } = renderTemplate('Ort: {{a}}\nOK', { a: null });
    expect(text).toBe('OK');
  });

  it('renders numeric values', () => {
    const { text } = renderTemplate('Zimmer: {{a}}', { a: 3 });
    expect(text).toBe('Zimmer: 3');
  });

  it('does not let a value that looks like a placeholder be substituted again', () => {
    const { text, unknown } = renderTemplate('{{a}}', { a: '{{b}}', b: 'boom' });
    expect(text).toBe('{{b}}');
    expect(unknown).toEqual([]);
  });

  it('returns an empty text for an empty template', () => {
    expect(renderTemplate('', {})).toEqual({ text: '', missing: [], unknown: [] });
    expect(renderTemplate(null, {})).toEqual({ text: '', missing: [], unknown: [] });
  });

  it('strips leading and trailing blank lines from the finished letter', () => {
    const { text } = renderTemplate('\n\nHallo\n\n\n', {});
    expect(text).toBe('Hallo');
  });
});

describe('renderTemplate against a hostile template', () => {
  it('does not backtrack its way through a long run of whitespace after a fallback bar', () => {
    // The fallback group used to be lazy AND followed by \\s*, so both could consume the same
    // whitespace. A single 20 000-character line took roughly 400 ms; the editor's preview
    // endpoint renders a draft on every pause in typing.
    const template = `{{a|${' '.repeat(20000)}`;
    const started = Date.now();
    renderTemplate(template, { a: 'x' });
    expect(Date.now() - started).toBeLessThan(100);
  });
});
