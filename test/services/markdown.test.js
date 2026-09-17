/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { markdownToSafeHtml } from '../../lib/services/markdown.js';

/**
 * The version banner used to hand GitHub's release body to Semi's MarkdownRender, an MDX compiler.
 * MDX reads HTML as JSX, so the unclosed `<img>` GitHub writes for a pasted screenshot failed the
 * whole compile and the changelog modal came up blank (#465).
 */
describe('markdownToSafeHtml', () => {
  it('renders the raw <img> GitHub writes for a pasted screenshot', () => {
    const html = markdownToSafeHtml(
      '<img width="913" alt="image" src="https://github.com/user-attachments/assets/x" />',
    );
    expect(html).toContain('src="https://github.com/user-attachments/assets/x"');
    expect(html).toContain('width="913"');
  });

  it('renders an <img> that is not self-closed, the shape that broke the modal', () => {
    // No trailing slash - valid HTML, and an unterminated JSX element to MDX.
    const html = markdownToSafeHtml(
      '<a href="https://ko-fi.com/orangecoding"><img alt="Ko-fi" src="https://img.shields.io/badge/x"></a>',
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="https://img.shields.io/badge/x"');
    expect(html).toContain('href="https://ko-fi.com/orangecoding"');
  });

  it('renders a whole release body, headings and prose and images alike', () => {
    const body = [
      '# Fredy 28.1.0',
      '',
      'This release fixes some bugs.',
      '',
      '<img width="913" height="247" alt="image" src="https://github.com/user-attachments/assets/8c5" />',
      '',
      '**Full Changelog**: https://github.com/orangecoding/fredy/compare/28.0.0...28.1.0',
      '',
      '---',
      '',
      '<a href="https://ko-fi.com/orangecoding"><img alt="Support me on Ko-fi" src="https://img.shields.io/badge/Ko--fi"></a>',
    ].join('\r\n');

    const html = markdownToSafeHtml(body);
    expect(html).toContain('<h1>Fredy 28.1.0</h1>');
    expect(html).toContain('This release fixes some bugs.');
    expect(html).toContain('<strong>Full Changelog</strong>');
    expect(html).toContain('<hr');
    expect(html.match(/<img/g)).toHaveLength(2);
  });

  it('renders GitHub flavoured markdown: lists, code, tables, strikethrough', () => {
    const html = markdownToSafeHtml('- one\n- two\n\n`code`\n\n~~gone~~\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<del>gone</del>');
    expect(html).toContain('<table>');
  });

  it('opens links in a new tab without handing the opener over', () => {
    const html = markdownToSafeHtml('[docs](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('drops scripts, event handlers and javascript: urls', () => {
    const html = markdownToSafeHtml(
      '<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">click</a>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('returns nothing for a release published without a body', () => {
    expect(markdownToSafeHtml(undefined)).toBe('');
    expect(markdownToSafeHtml(null)).toBe('');
    expect(markdownToSafeHtml('')).toBe('');
    expect(markdownToSafeHtml('   \n  ')).toBe('');
  });
});
