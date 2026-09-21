/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { PLACEHOLDERS, resolvePlaceholderValues } from '../../../lib/services/application/placeholders.js';

const listing = {
  title: 'Helle 3-Zimmer-Wohnung',
  address: 'Musterweg 1, 20255 Hamburg',
  price: 1200,
  size: 75.5,
  rooms: 3,
  price_per_sqm: 15.9,
  link: 'https://example.com/expose/1',
  provider: 'immoscout',
  published_at: Date.UTC(2026, 8, 19),
};

const profile = {
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
  wbs: false,
  guarantor: true,
  extra: 'Wir sind seit acht Jahren in Hamburg.',
};

const resolve = (overrides = {}) =>
  resolvePlaceholderValues({
    listing,
    profile,
    contact: null,
    language: 'de',
    now: new Date(Date.UTC(2026, 8, 19)),
    ...overrides,
  });

describe('the placeholder catalog', () => {
  it('resolves a value for every key it advertises', () => {
    const values = resolve();
    expect(Object.keys(values).sort()).toEqual(Object.keys(PLACEHOLDERS).sort());
  });

  it('still resolves every key when there is no profile and no contact at all', () => {
    const values = resolve({ profile: null, contact: null });
    expect(Object.keys(values).sort()).toEqual(Object.keys(PLACEHOLDERS).sort());
  });

  it('groups every key so the editor can list them', () => {
    for (const [key, definition] of Object.entries(PLACEHOLDERS)) {
      expect(definition.group, key).toMatch(/^(listing|applicant|contact|env)$/);
    }
  });
});

describe('listing values', () => {
  it('passes plain text through untouched', () => {
    expect(resolve()['listing.title']).toBe('Helle 3-Zimmer-Wohnung');
    expect(resolve()['listing.address']).toBe('Musterweg 1, 20255 Hamburg');
    expect(resolve()['listing.link']).toBe('https://example.com/expose/1');
  });

  it('formats the price as currency in the language of the letter', () => {
    expect(resolve()['listing.price']).toBe('1.200\u00a0€');
    expect(resolve({ language: 'it' })['listing.price']).toBe('1200\u00a0€');
    expect(resolve({ language: 'en' })['listing.price']).toBe('€1,200');
  });

  it('formats the living space with its unit', () => {
    expect(resolve()['listing.size']).toBe('75,5 m²');
    expect(resolve({ language: 'en' })['listing.size']).toBe('75.5 m²');
  });

  it('formats the publication date in the language of the letter', () => {
    expect(resolve()['listing.publishedAt']).toBe('19.09.2026');
    expect(resolve({ language: 'en' })['listing.publishedAt']).toBe('19/09/2026');
  });

  it('prefers a readable provider name over the internal provider id', () => {
    expect(resolve({ providerName: 'Immoscout' })['listing.provider']).toBe('Immoscout');
    expect(resolve()['listing.provider']).toBe('immoscout');
  });

  it('leaves a missing listing field empty rather than inventing a zero', () => {
    const values = resolve({ listing: { title: 'Nur ein Titel' } });
    expect(values['listing.price']).toBe('');
    expect(values['listing.size']).toBe('');
    expect(values['listing.publishedAt']).toBe('');
  });
});

describe('applicant values', () => {
  it('builds a full name out of the two halves', () => {
    expect(resolve()['applicant.fullName']).toBe('Max Mustermann');
  });

  it('builds a full name from whichever half exists', () => {
    expect(resolve({ profile: { lastName: 'Mustermann' } })['applicant.fullName']).toBe('Mustermann');
    expect(resolve({ profile: {} })['applicant.fullName']).toBe('');
  });

  it('builds a postal address line out of street, postcode and city', () => {
    expect(resolve()['applicant.address']).toBe('Beispielstraße 7, 20259 Hamburg');
  });

  it('leaves the address empty rather than emitting a lone comma', () => {
    expect(resolve({ profile: {} })['applicant.address']).toBe('');
  });

  it('phrases the household in the language of the letter', () => {
    expect(resolve()['applicant.household']).toBe('2 Erwachsene und 1 Kind');
    expect(resolve({ language: 'en' })['applicant.household']).toBe('2 adults and 1 child');
  });

  it('gets the singular and the plural right', () => {
    expect(resolve({ profile: { adults: 1 } })['applicant.household']).toBe('1 Erwachsener');
    expect(resolve({ profile: { adults: 2, children: 2 } })['applicant.household']).toBe('2 Erwachsene und 2 Kinder');
  });

  it('leaves the household empty when the user never said', () => {
    expect(resolve({ profile: {} })['applicant.household']).toBe('');
  });

  it('formats the net income as currency', () => {
    expect(resolve()['applicant.netIncome']).toBe('3.800\u00a0€');
  });

  it('formats the move-in date', () => {
    expect(resolve()['applicant.moveInDate']).toBe('01.12.2026');
  });

  it('turns the employment type into a phrase', () => {
    // A bare nominal, because the templates print it after a label: "Beschäftigung: unbefristet".
    expect(resolve()['applicant.employmentType']).toBe('unbefristet');
    expect(resolve({ language: 'en' })['applicant.employmentType']).toBe('Permanent');
  });

  it('leaves an employment type it does not know empty rather than printing the raw key', () => {
    expect(resolve({ profile: { employmentType: 'astronaut' } })['applicant.employmentType']).toBe('');
  });
});

describe('tri-state flags', () => {
  it('says not-a-smoker, and stays silent about the half that only harms the applicant', () => {
    // Same policy as SCHUFA, WBS and the guarantor. In the German rental market a line announcing
    // that the household smokes bins the application, and nobody volunteers it.
    expect(resolve()['applicant.smoker']).toBe('Der Haushalt ist ein Nichtraucherhaushalt');
    expect(resolve({ profile: { smoker: true } })['applicant.smoker']).toBe('');
  });

  it('stays silent about a flag the user never set', () => {
    expect(resolve({ profile: {} })['applicant.smoker']).toBe('');
    expect(resolve({ profile: {} })['applicant.schufa']).toBe('');
  });

  it('states a credit record that exists and says nothing about one that does not', () => {
    // Worded without naming the SCHUFA: the German letter also goes to Austria and Switzerland,
    // where that register does not exist.
    expect(resolve()['applicant.schufa']).toBe('Eine aktuelle Bonitätsauskunft liegt vor');
    expect(resolve({ profile: { schufa: false } })['applicant.schufa']).toBe('');
  });

  it('never volunteers that the applicant has no WBS', () => {
    expect(resolve()['applicant.wbs']).toBe('');
    expect(resolve({ profile: { wbs: true } })['applicant.wbs']).toBe('Ein Wohnberechtigungsschein liegt vor');
  });
});

describe('contact values', () => {
  it('addresses a named agent by name', () => {
    const values = resolve({ contact: { name: 'Frau Muster', company: 'Muster GmbH' } });
    expect(values['contact.name']).toBe('Frau Muster');
    expect(values['contact.company']).toBe('Muster GmbH');
    expect(values['contact.salutation']).toBe('Guten Tag Frau Muster');
  });

  it('falls back to an unaddressed salutation, which is the usual case', () => {
    expect(resolve()['contact.salutation']).toBe('Sehr geehrte Damen und Herren');
    expect(resolve({ language: 'en' })['contact.salutation']).toBe('Dear Sir or Madam');
    expect(resolve({ language: 'it' })['contact.salutation']).toBe('Spettabile Agenzia');
  });

  it('never leaves the salutation empty, so the greeting line can never be dropped', () => {
    expect(resolve({ contact: { name: null, company: 'Muster GmbH' } })['contact.salutation']).toBe(
      'Sehr geehrte Damen und Herren',
    );
  });
});

describe("today's date", () => {
  it('formats the current date in the language of the letter', () => {
    expect(resolve()['today']).toBe('19.09.2026');
  });
});

describe('hostile and malformed profile values', () => {
  it('does not resolve an employment type off the prototype chain', () => {
    // The same class of bug `renderTemplate` guards against with Object.hasOwn, one layer down.
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(resolve({ profile: { employmentType: key } })['applicant.employmentType'], key).toBe('');
    }
  });

  it('survives a date far outside the range a Date can represent', () => {
    // A unit mix-up - seconds where milliseconds were expected, or the other way round - must not
    // take down the letter for every listing the user owns.
    expect(() => resolve({ profile: { moveInDate: 1e300 } })).not.toThrow();
    expect(resolve({ profile: { moveInDate: 1e300 } })['applicant.moveInDate']).toBe('');
    expect(resolve({ listing: { published_at: 1e300 } })['listing.publishedAt']).toBe('');
  });

  it('reads a German thousands separator as a thousands separator', () => {
    expect(resolve({ profile: { netIncome: '1.200' } })['applicant.netIncome']).toBe('1.200 €');
    expect(resolve({ profile: { netIncome: '3.800' } })['applicant.netIncome']).toBe('3.800 €');
  });

  it('reads a German decimal comma as a decimal comma', () => {
    expect(resolve({ profile: { netIncome: '1.200,50' } })['applicant.netIncome']).toBe('1.201 €');
  });

  it('reads a plain number however it was typed', () => {
    expect(resolve({ profile: { netIncome: '1200' } })['applicant.netIncome']).toBe('1.200 €');
    expect(resolve({ profile: { netIncome: '1 200' } })['applicant.netIncome']).toBe('1.200 €');
    expect(resolve({ profile: { netIncome: '1200.50' } })['applicant.netIncome']).toBe('1.201 €');
  });

  it('leaves a value it cannot make sense of empty rather than printing a wrong figure', () => {
    // Telling a landlord the applicant earns one euro a month is worse than saying nothing.
    expect(resolve({ profile: { netIncome: 'ca. 3800' } })['applicant.netIncome']).toBe('');
    expect(resolve({ profile: { netIncome: 'viel' } })['applicant.netIncome']).toBe('');
  });

  it('leaves the living space empty when the stored value is not a number', () => {
    // Older rows stored size as "70 m²". Appending the unit before checking produced " m²", which
    // is non-empty and therefore survived the line-drop rule as `Wohnfläche: m²`.
    expect(resolve({ listing: { size: '70 m²' } })['listing.size']).toBe('');
    expect(resolve({ listing: { size: 'ca. 70' } })['listing.size']).toBe('');
    expect(resolve({ listing: { size: 70 } })['listing.size']).toBe('70 m²');
  });

  it("dates today by the server's own clock, not by UTC", () => {
    // A bare YYYY-MM-DD from the profile is pinned to UTC so it reads the same on every host, but
    // the clock is not a bare day: at 00:30 in Berlin, UTC is still yesterday.
    const lateEvening = new Date('2026-09-19T22:30:00Z');
    const expected = new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(lateEvening);
    expect(resolve({ now: lateEvening })['today']).toBe(expected);
  });
});
