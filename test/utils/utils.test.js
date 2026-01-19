/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { expect } from 'chai';
import { buildHash, extractEmbeddedJson } from '../../lib/utils.js';

describe('utilsCheck', () => {
  describe('#utilsCheck()', () => {
    it('should be null when null input', () => {
      expect(buildHash(null)).to.be.null;
    });
    it('should be null when null empty', () => {
      expect(buildHash('')).to.be.null;
    });
    it('should return a value', () => {
      expect(buildHash('bla', '', null)).to.be.a.string;
    });
  });
});

describe('extractEmbeddedJson', () => {
  describe('basic extraction', () => {
    it('should extract simple JSON from window.__INITIAL_STATE__', () => {
      const html = '<script>window.__INITIAL_STATE__={"foo":"bar"}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ foo: 'bar' });
    });

    it('should extract JSON with spaces around equals sign', () => {
      const html = '<script>window.__INITIAL_STATE__ = {"foo":"bar"}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ foo: 'bar' });
    });

    it('should extract JSON with bracket notation', () => {
      const html = '<script>window["__INITIAL_STATE__"]={"foo":"bar"}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ foo: 'bar' });
    });
  });

  describe('nested structures', () => {
    it('should handle deeply nested objects', () => {
      const html = '<script>window.__INITIAL_STATE__={"a":{"b":{"c":{"d":"value"}}}}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ a: { b: { c: { d: 'value' } } } });
    });

    it('should handle arrays in objects', () => {
      const html = '<script>window.__INITIAL_STATE__={"items":[1,2,3],"nested":[{"a":1}]}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ items: [1, 2, 3], nested: [{ a: 1 }] });
    });
  });

  describe('strings with special characters', () => {
    it('should handle braces inside strings', () => {
      const html = '<script>window.__INITIAL_STATE__={"text":"contains { and } braces"}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ text: 'contains { and } braces' });
    });

    it('should handle escaped quotes inside strings', () => {
      const html = '<script>window.__INITIAL_STATE__={"text":"has \\"escaped\\" quotes"}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ text: 'has "escaped" quotes' });
    });

    it('should handle escaped backslashes', () => {
      const html = '<script>window.__INITIAL_STATE__={"path":"C:\\\\Users\\\\test"}</script>';
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ path: 'C:\\Users\\test' });
    });
  });

  describe('edge cases', () => {
    it('should return null for null input', () => {
      expect(extractEmbeddedJson(null, '__INITIAL_STATE__')).to.be.null;
    });

    it('should return null for empty string', () => {
      expect(extractEmbeddedJson('', '__INITIAL_STATE__')).to.be.null;
    });

    it('should return null when variable not found', () => {
      const html = '<script>window.OTHER_VAR={"foo":"bar"}</script>';
      expect(extractEmbeddedJson(html, '__INITIAL_STATE__')).to.be.null;
    });

    it('should return null for invalid JSON', () => {
      const html = '<script>window.__INITIAL_STATE__={invalid json}</script>';
      expect(extractEmbeddedJson(html, '__INITIAL_STATE__')).to.be.null;
    });

    it('should return null when no opening brace after assignment', () => {
      const html = '<script>window.__INITIAL_STATE__=null</script>';
      expect(extractEmbeddedJson(html, '__INITIAL_STATE__')).to.be.null;
    });

    it('should handle HTML before and after the script', () => {
      const html = `
        <html>
        <head><title>Test</title></head>
        <body>
        <script>window.__INITIAL_STATE__={"data":"value"}</script>
        <div>content</div>
        </body>
        </html>
      `;
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result).to.deep.equal({ data: 'value' });
    });
  });

  describe('real-world patterns', () => {
    it('should extract SMG-style __INITIAL_STATE__ with listings', () => {
      const html = `
        <script>window.__INITIAL_STATE__={"resultList":{"search":{"fullSearch":{"result":{"listings":[{"id":1},{"id":2}]}}}}}</script>
      `;
      const result = extractEmbeddedJson(html, '__INITIAL_STATE__');
      expect(result.resultList.search.fullSearch.result.listings).to.have.length(2);
    });
  });
});
