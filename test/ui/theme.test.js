/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { applyTheme, currentTheme, normalizeTheme, DEFAULT_THEME, THEMES } from '../../ui/src/services/theme/theme.js';

const uiSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../ui/src');

/**
 * The one global theme.js touches. The suite runs without a DOM, and this double covers the whole
 * of its contact with the browser: a single attribute on the body.
 *
 * @returns {{attributes: Record<string, string>}}
 */
function stubBrowser() {
  const attributes = {};
  globalThis.document = {
    body: {
      setAttribute: (name, value) => (attributes[name] = value),
      getAttribute: (name) => attributes[name] ?? null,
    },
  };
  return { attributes };
}

describe('theme preference', () => {
  let browser;

  beforeEach(() => {
    browser = stubBrowser();
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it('offers exactly the two themes the stylesheets define a palette for', () => {
    expect(THEMES).toEqual(['dark', 'light']);
    expect(THEMES).toContain(DEFAULT_THEME);
  });

  it('falls back to the default for anything that is not a known theme', () => {
    for (const value of [undefined, null, '', 'sepia', 'DARK', 42, {}]) {
      expect(normalizeTheme(value)).toBe(DEFAULT_THEME);
    }
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
  });

  it('paints the document by setting the attribute Semi UI and themes.less both read', () => {
    expect(applyTheme('light')).toBe('light');
    expect(browser.attributes['theme-mode']).toBe('light');
    expect(currentTheme()).toBe('light');

    applyTheme('dark');
    expect(browser.attributes['theme-mode']).toBe('dark');
    expect(currentTheme()).toBe('dark');
  });

  it('never paints a theme it has no palette for', () => {
    expect(applyTheme('sepia')).toBe(DEFAULT_THEME);
    expect(browser.attributes['theme-mode']).toBe(DEFAULT_THEME);
  });

  it('is shipped on the body by index.html, so a cold load paints the default once', () => {
    const html = fs.readFileSync(path.join(uiSrc, '../../index.html'), 'utf-8');
    expect(html).toContain(`<body theme-mode="${DEFAULT_THEME}">`);
  });

  it('keeps no copy of the preference, which belongs to the settings table alone', () => {
    const source = fs.readFileSync(path.join(uiSrc, 'services/theme/theme.js'), 'utf-8');
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
});

describe('themes.less', () => {
  const source = fs.readFileSync(path.join(uiSrc, 'themes.less'), 'utf-8');

  /**
   * The custom properties declared inside one selector block.
   *
   * @param {string} selector
   * @returns {string[]}
   */
  function tokensIn(selector) {
    const start = source.indexOf(`${selector} {`);
    expect(start, `${selector} block is missing`).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\n}', start);
    const block = source.slice(start, end);
    return [...block.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]).sort();
  }

  it('defines every token in both themes', () => {
    // The failure this guards against is silent: a token added to one block only inherits whatever
    // the other theme happened to leave behind, and nothing looks wrong until someone switches.
    expect(tokensIn("body[theme-mode='light']")).toEqual(tokensIn(':root'));
  });

  it('is the only stylesheet carrying a colour literal', () => {
    const stylesheets = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.less') && entry.name !== 'themes.less') stylesheets.push(full);
      }
    };
    walk(uiSrc);

    /*
     * Colours that are not the theme's to decide, and are therefore allowed to stay literal:
     *  - scrims, and the hairlines drawn on them, where the surface underneath is a photograph and
     *    stays a photograph in both themes
     *  - `#000` used as a mask stencil, where the value is an on/off switch and not a colour
     *  - white on the accent, which is dark red in both themes
     *  - the dead `.chartCard` block, which renders nowhere (only its `__no__data` child is used)
     */
    const allowed = [
      /linear-gradient\(#000 0 0\)/g,
      /rgba\(0, 0, 0, [\d.]+\)/g,
      /rgba\(255, 255, 255, 0\.(12|22)\)/g,
      /color-mix\(in oklab, var\(--card-bg[^)]*\)[^;]*/g,
      /rgb\(70 72 78\)/g,
      /color: #fff;/g,
    ];

    const offenders = [];
    for (const file of stylesheets) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, index) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        const stripped = allowed.reduce((text, pattern) => text.replace(pattern, ''), line);
        if (/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(stripped)) {
          offenders.push(`${path.relative(uiSrc, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
