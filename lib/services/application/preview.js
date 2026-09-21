/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { resolvePlaceholderValues } from './placeholders.js';
import { renderTemplate } from './renderTemplate.js';
import { defaultTemplate } from './templates/index.js';

/**
 * Rendering a template against a stand-in listing, for the template editor.
 *
 * Pure, and deliberately server-side: the editor reaches it over
 * `POST /api/user/settings/application-preview` rather than rendering in the browser, because two
 * implementations of the same placeholder substitution would eventually disagree about the letter
 * the user is about to send. This is the same split the finance maths already uses.
 */

/**
 * The listing every preview is rendered against.
 *
 * Deliberately complete - price, size, rooms and a link all filled - so the preview shows what a
 * letter looks like at its best and any blank the user sees is their own profile talking.
 */
export const SAMPLE_LISTING = Object.freeze({
  title: 'Helle 3-Zimmer-Wohnung mit Balkon',
  address: 'Musterweg 1, 20255 Hamburg',
  price: 1250,
  size: 78,
  rooms: 3,
  price_per_sqm: 16.03,
  link: 'https://www.example.com/expose/123456',
  provider: 'immoscout',
  published_at: Date.UTC(2026, 8, 15),
});

/**
 * Render one template for the editor's live preview.
 *
 * @param {Object} params
 * @param {string|null} params.template The draft being edited, or null for the shipped letter.
 * @param {string} params.language ISO 639-1 language to render in.
 * @param {'rent'|'buy'} params.dealType Which of the two letters is being edited.
 * @param {Object|null} params.profile The user's own applicant profile, so the preview is theirs.
 * @param {Date} [params.now] Injectable clock.
 * @returns {{ template: string, text: string, missing: string[], unknown: string[] }} The rendered
 *   preview, plus the template it actually used so the editor can seed its field from it.
 */
export function previewApplicationTemplate({ template, language, dealType, profile, now = new Date() }) {
  const effective = typeof template === 'string' ? template : defaultTemplate(language, dealType);

  const rendered = renderTemplate(
    effective,
    // No contact: the sample listing is not from a portal that publishes an agent, and showing the
    // named salutation in the preview would promise something almost no real listing delivers.
    resolvePlaceholderValues({
      listing: SAMPLE_LISTING,
      profile,
      contact: null,
      language,
      providerName: 'Immoscout',
      now,
    }),
  );

  return { template: effective, ...rendered };
}
