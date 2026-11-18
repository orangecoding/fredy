/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { FeedItem } from '../storage/notificationFeedStorage.js' */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/**
 * Escape a value for XML text and attributes.
 *
 * Also removes the control characters XML 1.0 does not allow anywhere, escaped or not. Titles come
 * from scraped portal pages, and one stray character there would make the whole feed unreadable
 * to a strict parser, not just the one item.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeXml = (value) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[&<>"']/g, (character) => ENTITIES[character]);

const URL_PATTERN = /https?:\/\/[^\s<]+/g;

/**
 * Turn an item's plain text into the HTML an RSS description carries.
 *
 * The stored text is what every text adapter sends, one fact per line, with bare urls. Each line is
 * escaped and the urls become links, because most readers do not link them on their own.
 *
 * @param {string|null} text
 * @param {string|null} imageUrl
 * @returns {string}
 */
const descriptionHtml = (text, imageUrl) => {
  const lines = String(text ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => escapeXml(line).replace(URL_PATTERN, (url) => `<a href="${url}">${url}</a>`));
  const image =
    typeof imageUrl === 'string' && /^https?:\/\//.test(imageUrl) ? `<img src="${escapeXml(imageUrl)}"><br>` : '';
  return `${image}${lines.join('<br>')}`;
};

/**
 * @param {string} name
 * @param {unknown} value
 * @returns {string} The element, or nothing when there is no value.
 */
const element = (name, value) => (value == null || value === '' ? '' : `<${name}>${escapeXml(value)}</${name}>`);

/**
 * Render a feed as RSS 2.0.
 *
 * Every item gets its own guid rather than the listing's link: a price change is a second item about
 * the same advert, and a reader that keyed on the link would never show it.
 *
 * @param {Object} params
 * @param {string} params.title
 * @param {string|null} [params.link] Fredy's base url, when configured.
 * @param {string} params.description
 * @param {FeedItem[]} params.items Newest first.
 * @param {number} [params.now] Build date when there are no items yet.
 * @returns {string}
 */
export function renderRssFeed({ title, link = null, description, items, now = Date.now() }) {
  const built = new Date(items[0]?.createdAt ?? now).toUTCString();
  const entries = items.map(
    (item) =>
      '<item>' +
      element('title', item.title) +
      element('link', item.link) +
      `<guid isPermaLink="false">${escapeXml(item.id)}</guid>` +
      element('pubDate', new Date(item.createdAt).toUTCString()) +
      element('description', descriptionHtml(item.description, item.imageUrl)) +
      '</item>',
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>' +
    element('title', title) +
    element('link', link) +
    element('description', description) +
    element('lastBuildDate', built) +
    entries.join('') +
    '</channel></rss>\n'
  );
}
