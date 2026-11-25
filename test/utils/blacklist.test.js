/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { compileBlacklist } from '../../lib/utils/blacklist.js';
import { isOneOf } from '../../lib/utils.js';

const matches = (entries, text) => compileBlacklist(entries).test(text);

describe('compileBlacklist', () => {
  describe('plain entries', () => {
    it('match as a substring, ignoring case, as they always did', () => {
      expect(matches(['befristet'], 'Unbefristet, ab sofort')).toBe(true);
      expect(matches(['Tausch'], 'Austausch der Fenster 2024')).toBe(true);
      expect(matches(['bla'], 'BLA blub')).toBe(true);
      expect(matches(['bla'], 'blub')).toBe(false);
    });

    it('keep surrounding whitespace, so a leading space still anchors a word start', () => {
      expect(matches([' miete'], 'Kaltmiete 800')).toBe(false);
      expect(matches([' miete'], 'die Miete ist fair')).toBe(true);
    });

    it('treat regex syntax literally', () => {
      expect(matches(['3.5'], 'Zimmer: 345')).toBe(false);
      expect(matches(['(wbs)'], 'nur mit (WBS)')).toBe(true);
    });

    it('stay literal when they only look like the new syntax', () => {
      expect(matches(['!'], 'Jetzt zugreifen!')).toBe(true);
      expect(matches(['""'], 'ein "" im Text')).toBe(true);
      expect(matches(['"'], 'Zoll 21"')).toBe(true);
    });

    it('never match a missing text', () => {
      expect(matches(['bla'], null)).toBe(false);
      expect(matches(['bla'], undefined)).toBe(false);
      expect(matches([], 'bla')).toBe(false);
      expect(matches(null, 'bla')).toBe(false);
    });
  });

  describe('quoted entries', () => {
    it('match only as a whole word', () => {
      expect(matches(['"untermiete"'], 'Untermiete für 6 Monate')).toBe(true);
      expect(matches(['"untermiete"'], 'Untermiete!')).toBe(true);
      expect(matches(['"untermiete"'], 'Wir suchen einen ruhigen Untermieter')).toBe(false);
      expect(matches(['"tausch"'], 'nur Tausch')).toBe(true);
      expect(matches(['"tausch"'], 'Austausch der Fenster')).toBe(false);
      expect(matches(['"tausch"'], 'Wohnungstausch')).toBe(false);
    });

    it('treat umlauts, ß and digits as word characters', () => {
      expect(matches(['"geförderte"'], 'Öffentlich GEFÖRDERTE Wohnung')).toBe(true);
      expect(matches(['"geförderte"'], 'nicht geförderter Neubau')).toBe(false);
      expect(matches(['"förder"'], 'gefördert')).toBe(false);
      expect(matches(['"straße"'], 'Hauptstraße 5')).toBe(false);
      expect(matches(['"straße"'], 'an der Straße.')).toBe(true);
      expect(matches(['"wbs"'], 'WBS100 erforderlich')).toBe(false);
      expect(matches(['"wbs"'], 'WBS-Schein erforderlich')).toBe(true);
    });

    it('match an umlaut whichever way the text spells it', () => {
      expect(matches(['"geförderte"'], 'Geförderte Wohnung')).toBe(true);
    });

    it('match phrases and tolerate whitespace around the quotes', () => {
      expect(matches(['"nur tausch"'], 'Angebot: nur Tausch!')).toBe(true);
      expect(matches(['  " tausch "  '], 'nur Tausch')).toBe(true);
    });
  });

  describe('exceptions', () => {
    const blacklist = ['befristet', '!unbefristet'];

    it('keep text an exception covers', () => {
      expect(matches(blacklist, 'befristet bis 2027')).toBe(true);
      expect(matches(blacklist, 'unbefristet, ab sofort')).toBe(false);
      expect(matches(blacklist, 'UNBEFRISTET')).toBe(false);
    });

    it('still filter a text that has the term outside the exception as well', () => {
      expect(matches(blacklist, 'unbefristet, Stellplatz befristet bis 2027')).toBe(true);
      expect(matches(blacklist, 'befristet, später unbefristet')).toBe(true);
    });

    it('cover German compounds that whole-word matching misses', () => {
      const swap = ['tausch', '!austausch'];
      expect(matches(swap, 'Wohnungstausch')).toBe(true);
      expect(matches(swap, 'nur Tausch')).toBe(true);
      expect(matches(swap, 'Austausch der Fenster 2024')).toBe(false);
    });

    it('ignore a match overlapping an exception instead of gluing its neighbours together', () => {
      expect(matches(['fristet bis'], 'unbefristet bis')).toBe(true);
      expect(matches(['fristet bis', '!unbefristet'], 'unbefristet bis')).toBe(false);
      expect(matches(['befristet', '!xy'], 'befrxyistet')).toBe(false);
      expect(matches(['"tausch"', '!aus'], 'Austausch')).toBe(false);
    });

    it('can be quoted themselves', () => {
      const swap = ['tausch', '!"austausch"'];
      expect(matches(swap, 'Austausch der Fenster')).toBe(false);
      expect(matches(swap, 'Fensteraustausch')).toBe(true);
    });

    it('filter nothing on their own and tolerate a space after the mark', () => {
      expect(matches(['!unbefristet'], 'unbefristet')).toBe(false);
      expect(matches(['befristet', '! unbefristet'], 'unbefristet')).toBe(false);
    });
  });

  it('is what isOneOf matches with', () => {
    expect(isOneOf('unbefristet', ['befristet', '!unbefristet'])).toBe(false);
    expect(isOneOf('Untermieter gesucht', ['"untermiete"'])).toBe(false);
    expect(isOneOf('Untermiete', ['"untermiete"'])).toBe(true);
  });
});
