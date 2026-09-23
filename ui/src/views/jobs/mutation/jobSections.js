/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which section of the form each requirement is satisfied in.
 *
 * The keys are those of `JOB_REQUIREMENTS`; `test/ui/jobFormView.test.js` asserts that every
 * requirement has an entry here, so a fifth rule cannot be added without a place to send the user.
 *
 * Two requirements share one section, which is why this is a map rather than a list: name and deal
 * type are two rows of the same Grunddaten card, so both send the user to the same place.
 *
 * The anchor is the card rather than the row: scrolling a card into view shows the whole of what is
 * missing, scrolling one row into view shows a control with the card's title off screen above it.
 *
 * @type {Record<string, string>}
 */
export const SECTION_BY_REQUIREMENT = {
  name: 'jobSection-basics',
  dealType: 'jobSection-basics',
  provider: 'jobSection-provider',
  channel: 'jobSection-channel',
};

/**
 * Scroll a section of the form into view.
 *
 * `auto` rather than `smooth` when the user asked for less motion: this is a jump across a long
 * form, which is exactly the kind of movement that setting exists for.
 *
 * @param {string} sectionId
 * @returns {void}
 */
export function scrollToSection(sectionId) {
  const target = document.getElementById(sectionId);
  if (target == null) return;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
