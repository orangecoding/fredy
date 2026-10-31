/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { getDirName } from '../utils.js';
import logger from './logger.js';

/**
 * Read a notification adapter's setup guide.
 *
 * Returns the raw markdown - the frontend renders it with Semi's MarkdownRender. The old name
 * (`markdown2Html`) promised a conversion that never happened, and it took a CWD-relative path
 * resolved while the adapter modules were still being imported, so starting Fredy from anywhere
 * but the repository root threw before a single route existed.
 *
 * A missing or unreadable guide is not worth failing startup over: the adapter simply shows no
 * instructions.
 *
 * @param {string} fileName - File name of the guide, relative to lib/notification/adapter.
 * @returns {string} The markdown source, or an empty string when it cannot be read.
 */
export function readAdapterReadme(fileName) {
  const fullPath = path.join(getDirName(), 'notification', 'adapter', path.basename(fileName));
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    logger.warn(`Could not read the setup guide "${fileName}".`, error?.message || error);
    return '';
  }
}

/**
 * Tags and attributes a rendered changelog may keep.
 *
 * Everything not listed here is dropped, including `script`, `style`, inline event handlers and
 * anything carrying a `javascript:` URL. `img` is the one addition that matters: GitHub inlines
 * screenshots into release notes as raw HTML, and sanitize-html leaves `img` out of its defaults.
 * `details`/`summary` and `del` are the other three elements release notes actually use.
 *
 * Links open in a new tab because the changelog is shown inside a modal in a long-running SPA -
 * following one in place would throw away whatever the user was doing.
 */
const CHANGELOG_SANITIZE_OPTIONS = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'del', 'details', 'summary'],
  allowedAttributes: {
    // `target` and `rel` survive the filter only so the transform below can set them; whatever the
    // source wrote is overwritten either way.
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/**
 * Render GitHub-flavoured markdown into HTML that is safe to inject into the page.
 *
 * The version banner used to hand the release body straight to Semi's `MarkdownRender`, which
 * compiles its input as **MDX**. MDX reads HTML as JSX, so a plain `<img ...>` - exactly what
 * GitHub writes when a screenshot is pasted into a release - is an unclosed JSX element and the
 * whole compile throws. The component swallows that rejection and keeps its placeholder, which is
 * why the changelog modal came up blank (#465). Release notes are GFM, not MDX, so they are parsed
 * as GFM here and arrive at the browser as finished HTML.
 *
 * Doing it server-side also means the conversion happens once per cached GitHub answer rather than
 * on every render, and the parser never ships to the browser.
 *
 * `breaks: true` matches github.com, which renders release bodies like comments: a single newline
 * is a line break, not a space.
 *
 * @param {string} markdown - Markdown source, typically a GitHub release body.
 * @returns {string} Sanitised HTML, or an empty string when there is nothing to render.
 */
export function markdownToSafeHtml(markdown) {
  if (typeof markdown !== 'string' || markdown.trim().length === 0) {
    return '';
  }
  return sanitizeHtml(marked.parse(markdown, { gfm: true, breaks: true, async: false }), CHANGELOG_SANITIZE_OPTIONS);
}

/**
 * The readable text of a heading's inline tokens: `**calmer**` is "calmer", a code span its code.
 *
 * @param {Array<{text?: string, tokens?: Array}>} tokens
 * @returns {string}
 */
function inlineText(tokens) {
  return tokens.map((token) => (Array.isArray(token.tokens) ? inlineText(token.tokens) : (token.text ?? ''))).join('');
}

/**
 * The sections of a release body, for the contents beside long release notes.
 *
 * Read from marked's tokens because it has the structure already. Only top-level headings down to
 * h3 count, which is exactly what the browser looks up to scroll to the n-th section
 * (`.releaseNotes > h1, h2, h3`). A heading typed as raw HTML would put the two out of step; release
 * notes are written in markdown and have none.
 *
 * @param {string} markdown - Markdown source, typically a GitHub release body.
 * @returns {{title: string, items: number}[]} One entry per heading, with the number of list items
 *   directly under it (nested lists not counted). Empty when the body has no headings.
 */
export function releaseOutline(markdown) {
  if (typeof markdown !== 'string') {
    return [];
  }
  const outline = [];
  for (const token of marked.lexer(markdown, { gfm: true })) {
    if (token.type === 'heading' && token.depth <= 3) {
      outline.push({ title: inlineText(token.tokens ?? []).trim(), items: 0 });
    } else if (token.type === 'list' && outline.length > 0) {
      outline[outline.length - 1].items += token.items.length;
    }
  }
  return outline;
}
