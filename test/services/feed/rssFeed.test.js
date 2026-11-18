/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { escapeXml, renderRssFeed } from '../../../lib/services/feed/rssFeed.js';

const CREATED = Date.UTC(2026, 10, 18, 9, 30);

const item = (over = {}) => ({
  id: 'i1',
  kind: 'listing',
  title: 'Berlin: Flat',
  link: 'https://portal.example/expose/1?a=1&b=2',
  description: 'Address: Torstrasse 1\nOpen in Fredy: https://fredy.example/#/listings/listing/l1',
  imageUrl: 'https://cdn.example/1.jpg',
  createdAt: CREATED,
  ...over,
});

const render = (items) =>
  renderRssFeed({ title: 'Fredy: Feed', link: 'https://fredy.example', description: 'Listings', items });

describe('escapeXml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &apos;Jerry&apos;&lt;/a&gt;',
    );
  });

  it('drops the control characters XML does not allow, which would break the whole feed', () => {
    expect(escapeXml('Flat\u0000\u0008 with\tview\u001F')).toBe('Flat with\tview');
  });

  it('turns a missing value into nothing', () => {
    expect(escapeXml(null)).toBe('');
  });
});

describe('renderRssFeed', () => {
  it('renders an RSS 2.0 channel with one item per feed row', () => {
    const xml = render([item(), item({ id: 'i2', title: 'Second' })]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>')).toBe(true);
    expect(xml).toContain('<title>Fredy: Feed</title><link>https://fredy.example</link>');
    expect(xml.match(/<item>/g)).toHaveLength(2);
    expect(xml).toContain(`<lastBuildDate>${new Date(CREATED).toUTCString()}</lastBuildDate>`);
  });

  it('gives every item its own guid, so a price change is not taken for the listing again', () => {
    const xml = render([item()]);
    expect(xml).toContain('<guid isPermaLink="false">i1</guid>');
    expect(xml).toContain(`<pubDate>${new Date(CREATED).toUTCString()}</pubDate>`);
  });

  it('escapes the link', () => {
    expect(render([item()])).toContain('<link>https://portal.example/expose/1?a=1&amp;b=2</link>');
  });

  it('carries the description as escaped html with the picture first and the urls linked', () => {
    const xml = render([item()]);
    const description = xml.split('<item>')[1].match(/<description>(.*?)<\/description>/)[1];
    const html = description
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&');
    expect(html).toBe(
      '<img src="https://cdn.example/1.jpg"><br>Address: Torstrasse 1<br>' +
        'Open in Fredy: <a href="https://fredy.example/#/listings/listing/l1">https://fredy.example/#/listings/listing/l1</a>',
    );
  });

  it('cannot be broken out of by a title, even one that closes a CDATA section', () => {
    const xml = render([item({ title: 'Flat ]]></title><script>x</script>' })]);
    expect(xml).toContain('<title>Flat ]]&gt;&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>');
    expect(xml).not.toContain('<script>');
  });

  it('leaves out what an item does not have, and only takes web pictures', () => {
    const xml = render([item({ link: null, description: null, imageUrl: 'javascript:alert(1)' })]);
    expect(xml).not.toMatch(/<item>.*<link>/);
    expect(xml).not.toContain('javascript');
  });

  it('is a valid empty channel before the first notification', () => {
    const xml = renderRssFeed({ title: 'Fredy: Feed', description: 'Listings', items: [], now: CREATED });
    expect(xml).not.toContain('<item>');
    expect(xml).not.toContain('<link>');
    expect(xml).toContain(`<lastBuildDate>${new Date(CREATED).toUTCString()}</lastBuildDate>`);
  });
});
