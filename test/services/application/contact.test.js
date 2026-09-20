/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { parseAgentFromDescription } from '../../../lib/services/application/contact.js';

/**
 * The strings below are not guesses at ImmoScout's HTML - they are exactly what Fredy itself writes
 * in `buildDescription` (lib/provider/immoscout.js). Keep them byte-identical to that template,
 * trailing spaces included, or this suite stops testing the real input.
 */
const withCompanyAndStars =
  'Agent: Max Mustermann (Musterimmobilien GmbH) - 5 stars\nPhone Numbers:\nMobil: 0170 1234567\n\nBaujahr 1998\n\nLage\nSchöne Wohnung.';
const withCompanyNoStars = 'Agent: Max Mustermann (Musterimmobilien GmbH) \n\n\n\n';
const withStarsNoCompany = 'Agent: Max Mustermann - 5 stars\n\n\n\n';
const bareName = 'Agent: Max Mustermann \n\n\n\n';

describe('parseAgentFromDescription', () => {
  it('reads name and company out of the agent line', () => {
    expect(parseAgentFromDescription(withCompanyAndStars)).toEqual({
      name: 'Max Mustermann',
      company: 'Musterimmobilien GmbH',
    });
  });

  it('reads the name when no company was published', () => {
    expect(parseAgentFromDescription(withStarsNoCompany)).toEqual({
      name: 'Max Mustermann',
      company: null,
    });
  });

  it('does not mistake the star rating for part of the company', () => {
    expect(parseAgentFromDescription(withCompanyNoStars)).toEqual({
      name: 'Max Mustermann',
      company: 'Musterimmobilien GmbH',
    });
  });

  it('reads a bare name with neither company nor rating', () => {
    expect(parseAgentFromDescription(bareName)).toEqual({ name: 'Max Mustermann', company: null });
  });

  it('treats the "Unbekannt" placeholder as no agent at all', () => {
    expect(parseAgentFromDescription('Agent: Unbekannt \n\nBaujahr 1998')).toBeNull();
  });

  it('keeps the company when only the agent name is unknown', () => {
    expect(parseAgentFromDescription('Agent: Unbekannt (Musterimmobilien GmbH) \n\n')).toEqual({
      name: null,
      company: 'Musterimmobilien GmbH',
    });
  });

  it('returns null for descriptions from providers that publish no agent', () => {
    expect(parseAgentFromDescription('Schöne 3-Zimmer-Wohnung in bester Lage.')).toBeNull();
  });

  it('only looks at the first line, so a later mention cannot be mistaken for the agent', () => {
    expect(parseAgentFromDescription('Schöne Wohnung.\nAgent: Fake Person\n')).toBeNull();
  });

  it('survives missing input', () => {
    expect(parseAgentFromDescription(null)).toBeNull();
    expect(parseAgentFromDescription(undefined)).toBeNull();
    expect(parseAgentFromDescription('')).toBeNull();
  });
});

describe('parseAgentFromDescription with awkward agency names', () => {
  it('keeps a company whose own name contains parentheses out of the agent name', () => {
    // Franchise and licence-partner suffixes are common on ImmoScout.
    expect(parseAgentFromDescription('Agent: Herr Schmidt (Engel & Völkers (Altona)) - 5 stars\n')).toEqual({
      name: 'Herr Schmidt',
      company: 'Engel & Völkers (Altona)',
    });
  });

  it('handles the branch where the name is unknown but a rating was published', () => {
    expect(parseAgentFromDescription('Agent: Unbekannt - 4.5 stars\n\n')).toBeNull();
  });

  it('does not treat a parenthesis inside the name as the start of the company', () => {
    expect(parseAgentFromDescription('Agent: Max Mustermann\n')).toEqual({ name: 'Max Mustermann', company: null });
  });
});
