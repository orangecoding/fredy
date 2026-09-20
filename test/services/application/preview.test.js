/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { SAMPLE_LISTING, previewApplicationTemplate } from '../../../lib/services/application/preview.js';
import { TEMPLATES } from '../../../lib/services/application/templates/index.js';

const profile = { firstName: 'Max', lastName: 'Mustermann', occupation: 'Softwareentwickler' };
const now = new Date(Date.UTC(2026, 8, 19));

describe('previewApplicationTemplate', () => {
  it('renders the template it was handed', () => {
    const result = previewApplicationTemplate({
      template: 'Hallo, ich bin {{applicant.fullName}}.',
      language: 'de',
      dealType: 'rent',
      profile,
      now,
    });
    expect(result.text).toBe('Hallo, ich bin Max Mustermann.');
  });

  it('falls back to the shipped letter when handed no template, and says which one it used', () => {
    const result = previewApplicationTemplate({ template: null, language: 'de', dealType: 'buy', profile, now });
    expect(result.template).toBe(TEMPLATES.de.buy);
    expect(result.text).toContain('Besichtigungsanfrage');
  });

  it('renders against a sample listing, so the editor shows a letter rather than a form', () => {
    const result = previewApplicationTemplate({
      template: '{{listing.title}} | {{listing.address}}',
      language: 'de',
      dealType: 'rent',
      profile,
      now,
    });
    expect(result.text).toBe(`${SAMPLE_LISTING.title} | ${SAMPLE_LISTING.address}`);
  });

  it('reports what the profile does not cover', () => {
    const result = previewApplicationTemplate({
      template: 'Beruf: {{applicant.occupation}}\nArbeitgeber: {{applicant.employer}}',
      language: 'de',
      dealType: 'rent',
      profile,
      now,
    });
    expect(result.missing).toEqual(['applicant.employer']);
  });

  it('reports a placeholder that does not exist, so the editor can point at the typo', () => {
    const result = previewApplicationTemplate({
      template: 'Hallo {{applicant.nachname}}',
      language: 'de',
      dealType: 'rent',
      profile,
      now,
    });
    expect(result.unknown).toEqual(['applicant.nachname']);
  });

  it('previews in the language asked for, not the one the sample listing came from', () => {
    const result = previewApplicationTemplate({ template: null, language: 'it', dealType: 'rent', profile, now });
    expect(result.text.startsWith('Oggetto:')).toBe(true);
  });

  it('works without a profile at all', () => {
    const result = previewApplicationTemplate({ template: null, language: 'de', dealType: 'rent', profile: null, now });
    expect(result.text).toContain(SAMPLE_LISTING.title);
    expect(result.text).not.toMatch(/\{\{/);
  });

  it('never addresses a named agent, because the sample listing has none', () => {
    const result = previewApplicationTemplate({ template: null, language: 'de', dealType: 'rent', profile, now });
    expect(result.text).toContain('Sehr geehrte Damen und Herren');
  });
});
