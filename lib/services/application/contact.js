/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The agent behind a listing, as far as anything is known about them.
 *
 * @typedef {Object} ListingContact
 * @property {string|null} name Agent's personal name, or null when the portal withheld it.
 * @property {string|null} company Agency the agent works for, or null.
 */

/** ImmoScout writes `Agent: Unbekannt` rather than omitting the line when no name was published. */
const UNKNOWN_AGENT = 'Unbekannt';

/** Trailing ` - 5 stars` rating, which is part of the line but never part of the name. */
const RATING_SUFFIX = /\s*-\s*[\d.,]+\s*stars\s*$/i;

/** Where the agency starts: the first parenthesis after the name. */
const COMPANY_OPEN = '(';

/** Only the very first line of a description can be the agent line. */
const AGENT_LINE = /^Agent:\s*(.*)$/;

/**
 * Recover the agent's name and agency from a listing description.
 *
 * This parses a format Fredy writes itself - `buildDescription` in `lib/provider/immoscout.js`
 * prepends `Agent: <name> (<company>) - <n> stars` before the rest of the text - rather than a
 * portal's markup, which is why a regex is appropriate here and would not be against raw HTML.
 * ImmoScout is the only provider that captures agent data at all, and only when the job owner has
 * enabled provider details for it, so every other listing correctly yields null.
 *
 * @param {string|null|undefined} description Raw listing description.
 * @returns {ListingContact|null} Contact data, or null when the description names no agent.
 */
export function parseAgentFromDescription(description) {
  if (typeof description !== 'string' || description.length === 0) return null;

  const firstLine = description.split('\n', 1)[0];
  const agentLine = AGENT_LINE.exec(firstLine);
  if (agentLine == null) return null;

  let rest = agentLine[1].trim();

  // Rating first, then company: the published order is `name (company) - n stars`, so cutting the
  // rating off is what leaves the parentheses at the end where the company pattern can find them.
  rest = rest.replace(RATING_SUFFIX, '');

  // Split at the FIRST parenthesis rather than matching a balanced-looking run at the end: licence
  // partners and franchises publish names like `Engel & Völkers (Altona)`, and a pattern anchored
  // on the last `)` cannot span the inner one - it gave up and glued the whole agency onto the
  // agent's name, which then appeared in the salutation.
  let company = null;
  const open = rest.indexOf(COMPANY_OPEN);
  if (open !== -1 && rest.endsWith(')')) {
    company = rest.slice(open + 1, -1).trim() || null;
    rest = rest.slice(0, open);
  }

  const name = rest.trim();
  const realName = name.length === 0 || name === UNKNOWN_AGENT ? null : name;

  if (realName == null && company == null) return null;

  return { name: realName, company };
}
