/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { TEMPLATES, TEMPLATE_LANGUAGES, defaultTemplate } from '../../../lib/services/application/templates/index.js';
import { PLACEHOLDERS, resolvePlaceholderValues } from '../../../lib/services/application/placeholders.js';
import { renderTemplate } from '../../../lib/services/application/renderTemplate.js';

const listing = {
  title: 'Helle 3-Zimmer-Wohnung',
  address: 'Musterweg 1, 20255 Hamburg',
  price: 1200,
  size: 75,
  rooms: 3,
  link: 'https://example.com/expose/1',
  provider: 'immoscout',
};

const fullProfile = {
  firstName: 'Max',
  lastName: 'Mustermann',
  street: 'Beispielstraße 7',
  zip: '20259',
  city: 'Hamburg',
  phone: '0170 1234567',
  email: 'max@example.com',
  adults: 2,
  children: 1,
  pets: 'eine Katze',
  smoker: false,
  occupation: 'Softwareentwickler',
  employer: 'Beispiel GmbH',
  employmentType: 'permanent',
  netIncome: 3800,
  moveInDate: '2026-12-01',
  schufa: true,
  wbs: true,
  guarantor: true,
  extra: 'Seit acht Jahren in Hamburg zu Hause, gesucht wird langfristig.',
};

const render = (language, dealType, profile) =>
  renderTemplate(
    defaultTemplate(language, dealType),
    resolvePlaceholderValues({ listing, profile, contact: null, language, now: new Date(Date.UTC(2026, 8, 19)) }),
  );

const everyTemplate = TEMPLATE_LANGUAGES.flatMap((language) =>
  ['rent', 'buy'].map((dealType) => ({ language, dealType })),
);

describe('the shipped templates', () => {
  it('covers rent and buy in every language it advertises', () => {
    for (const { language, dealType } of everyTemplate) {
      expect(typeof TEMPLATES[language]?.[dealType], `${language}/${dealType}`).toBe('string');
      expect(TEMPLATES[language][dealType].length, `${language}/${dealType}`).toBeGreaterThan(0);
    }
  });

  it('refers only to placeholders the catalog can actually fill', () => {
    for (const { language, dealType } of everyTemplate) {
      expect(render(language, dealType, fullProfile).unknown, `${language}/${dealType}`).toEqual([]);
    }
  });

  it('produces a complete letter when the profile is filled in', () => {
    for (const { language, dealType } of everyTemplate) {
      const { text, missing } = render(language, dealType, fullProfile);
      expect(missing, `${language}/${dealType}`).toEqual([]);
      expect(text, `${language}/${dealType}`).not.toMatch(/\{\{/);
      expect(text.length, `${language}/${dealType}`).toBeGreaterThan(200);
    }
  });

  it('still produces a usable letter when no profile exists at all', () => {
    for (const { language, dealType } of everyTemplate) {
      const { text } = render(language, dealType, null);
      expect(text, `${language}/${dealType}`).not.toMatch(/\{\{/);
      // Whatever survived must still be a letter: a greeting, the listing, and a sign-off.
      expect(text, `${language}/${dealType}`).toContain(listing.title);
      expect(text.split('\n').length, `${language}/${dealType}`).toBeGreaterThan(4);
    }
  });

  it('never leaves a dangling label behind when a profile field is missing', () => {
    const { text } = render('de', 'rent', { firstName: 'Max', lastName: 'Mustermann' });
    expect(text).not.toMatch(/^\s*[\wÄÖÜäöüß -]+:\s*$/m);
  });

  it('names the listing and links to it in every letter', () => {
    for (const { language, dealType } of everyTemplate) {
      const { text } = render(language, dealType, fullProfile);
      expect(text, `${language}/${dealType}`).toContain(listing.title);
      expect(text, `${language}/${dealType}`).toContain(listing.link);
    }
  });

  it('opens with a subject line', () => {
    for (const { language, dealType } of everyTemplate) {
      const { text } = render(language, dealType, fullProfile);
      expect(text.split('\n')[0], `${language}/${dealType}`).toMatch(/^(Betreff|Subject|Oggetto):/);
    }
  });

  it('asks for a viewing when buying, and offers the applicant facts when renting', () => {
    expect(render('de', 'rent', fullProfile).text).toContain('Softwareentwickler');
    // A purchase enquiry is a viewing request, not a self-disclosure: no income, no SCHUFA.
    const buy = render('de', 'buy', fullProfile).text;
    expect(buy).not.toContain('SCHUFA');
    expect(buy).toMatch(/Besichtigung/);
  });
});

describe('defaultTemplate', () => {
  it('returns the template for the language and deal type asked for', () => {
    expect(defaultTemplate('it', 'buy')).toBe(TEMPLATES.it.buy);
  });

  it('falls back to renting for an unknown deal type, which is the common case', () => {
    expect(defaultTemplate('de', null)).toBe(TEMPLATES.de.rent);
    expect(defaultTemplate('de', 'nonsense')).toBe(TEMPLATES.de.rent);
  });

  it('falls back to English for a language it does not ship', () => {
    expect(defaultTemplate('tr', 'rent')).toBe(TEMPLATES.en.rent);
  });
});

describe('the placeholder catalog and the templates agree', () => {
  it('documents every placeholder the templates use', () => {
    const used = new Set();
    for (const { language, dealType } of everyTemplate) {
      for (const match of defaultTemplate(language, dealType).matchAll(/\{\{\s*([\w.]+)/g)) {
        used.add(match[1]);
      }
    }
    for (const key of used) {
      expect(PLACEHOLDERS, key).toHaveProperty([key]);
    }
  });
});

describe('what the shipped letters are careful not to say', () => {
  const singlePerson = { ...fullProfile, adults: 1, children: 0, smoker: true, wbs: true };

  it('never volunteers that the applicant smokes', () => {
    // The module's own policy: state what helps, stay silent about what only harms. It is applied
    // to SCHUFA, WBS and the guarantor; smoking was the one flag it was inverted on.
    for (const { language, dealType } of everyTemplate) {
      const { text } = render(language, dealType, singlePerson);
      expect(text.toLowerCase(), `${language}/${dealType}`).not.toMatch(/raucherhaushalt|smoking household|fumatori/);
    }
  });

  it('never claims the applicant has no pets when they simply did not say', () => {
    const { text } = render('de', 'rent', { firstName: 'Max', lastName: 'Mustermann' });
    expect(text).not.toContain('Haustiere');
  });

  it('never writes a sentence that assumes more than one applicant', () => {
    for (const { language, dealType } of everyTemplate) {
      const { text } = render(language, dealType, singlePerson);
      expect(text, `${language}/${dealType}`).not.toMatch(/\bWir sind\b|\bWe are\b|\bSiamo\b/);
    }
  });

  it('never names a German credit register, since the same letter also goes to Austria and Switzerland', () => {
    // The SCHUFA exists in neither. The credit statement is carried by the {{applicant.schufa}}
    // line, whose phrase table words it neutrally, and nothing else hard-codes the name.
    for (const profile of [fullProfile, { ...fullProfile, schufa: false }, null]) {
      expect(render('de', 'rent', profile).text).not.toContain('SCHUFA');
    }
  });

  it('keeps a purchase enquiry to a viewing request rather than a self-disclosure', () => {
    // Handing a seller's agent the employer and household size before a viewing gives away the
    // buyer's position for nothing.
    for (const language of TEMPLATE_LANGUAGES) {
      const { text } = render(language, 'buy', fullProfile);
      expect(text, language).not.toContain(fullProfile.employer);
      expect(text, language).not.toContain(fullProfile.occupation);
      expect(text, language).not.toMatch(/2 Erwachsene|2 adults|2 adulti/);
    }
  });

  it('states a housing entitlement certificate in the German rental letter, where it decides applications', () => {
    const { text } = render('de', 'rent', { ...fullProfile, wbs: true });
    expect(text).toContain('Wohnberechtigungsschein');
    expect(render('de', 'rent', { ...fullProfile, wbs: false }).text).not.toContain('Wohnberechtigungsschein');
  });

  it('still names the listing when the listing has no title', () => {
    const untitled = { ...listing, title: undefined };
    const { text } = renderTemplate(
      defaultTemplate('de', 'rent'),
      resolvePlaceholderValues({ listing: untitled, profile: fullProfile, contact: null, language: 'de' }),
    );
    expect(text.split('\n')[0]).toMatch(/^Betreff: .+/);
    expect(text).toContain('Ihr Inserat');
  });

  it('opens the body with a capital letter in the languages that require one', () => {
    for (const language of ['en', 'it']) {
      for (const dealType of ['rent', 'buy']) {
        const body = render(language, dealType, fullProfile).text.split('\n');
        // Line 0 is the subject, 2 is the salutation, 4 is the first line of the body.
        expect(body[4], `${language}/${dealType}`).toMatch(/^[A-ZÀ-Þ]/);
      }
    }
  });

  it('never needs to know the applicant’s gender', () => {
    for (const { language, dealType } of everyTemplate) {
      const { text } = render(language, dealType, fullProfile);
      expect(text, `${language}/${dealType}`).not.toMatch(/Sarei lieto|lieta\b/);
    }
  });
});
