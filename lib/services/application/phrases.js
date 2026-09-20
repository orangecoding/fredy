/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The wording an application letter needs that is not a template and not a raw value.
 *
 * Salutations, household phrasing, employment types and the yes/no flags all have to inflect, so
 * they cannot live in the template as plain text and cannot be a bare value either. They sit here,
 * beside the templates, rather than in the interface translations: a letter's language follows the
 * portal's country and is routinely not the language the interface is in.
 */

/**
 * @typedef {Object} FlagPhrases
 * @property {string} yes Wording when the flag is true.
 * @property {string} no Wording when the flag is false. Empty means the letter stays silent.
 *
 * Either side may be empty. A flag only ever states the half that helps the applicant: nobody is
 * served by announcing that they hold no housing entitlement certificate, and nobody is served by
 * announcing that they smoke - in the German rental market that line alone bins an application.
 */

/**
 * @typedef {Object} LanguagePhrases
 * @property {string} locale BCP-47 tag used for every number, currency and date in the letter.
 * @property {(name: string) => string} salutationNamed
 * @property {string} salutationAnonymous
 * @property {(adults: number, children: number) => string} household
 * @property {Record<string, string>} employmentType
 * @property {Record<string, FlagPhrases>} flags
 */

/**
 * Join the parts of a household description with the language's own conjunction.
 *
 * @param {string[]} parts
 * @param {string} conjunction
 * @returns {string}
 */
function joinHousehold(parts, conjunction) {
  return parts.filter(Boolean).join(conjunction);
}

/** @type {Record<string, LanguagePhrases>} */
export const PHRASES = {
  de: {
    locale: 'de-DE',
    // No gender is known for a scraped agent name, and German salutations inflect for it. Plain
    // "Guten Tag <name>" is the one form that stays correct either way and still sounds addressed.
    salutationNamed: (name) => `Guten Tag ${name}`,
    salutationAnonymous: 'Sehr geehrte Damen und Herren',
    household: (adults, children) =>
      joinHousehold(
        [
          adults > 0 ? (adults === 1 ? '1 Erwachsener' : `${adults} Erwachsene`) : '',
          children > 0 ? (children === 1 ? '1 Kind' : `${children} Kinder`) : '',
        ],
        ' und ',
      ),
    // Bare nominals, because the templates print them after a label. A predicate reads wrong
    // there: "Beschäftigung: im Ruhestand" contradicts its own label, and "unbefristet angestellt"
    // repeats the stem of "Anstellung".
    employmentType: {
      permanent: 'unbefristet',
      temporary: 'befristet',
      selfEmployed: 'selbstständig',
      civilServant: 'verbeamtet',
      student: 'Ausbildung oder Studium',
      retired: 'Ruhestand',
    },
    // Whole sentences, all four the same shape, so the template is a bare `{{x}}.` line and no
    // future edit can put a predicate where a noun was expected. None of them commits to a number
    // of applicants, which a "Wir sind …" wrapper did.
    flags: {
      smoker: { yes: '', no: 'Der Haushalt ist ein Nichtraucherhaushalt' },
      schufa: { yes: 'Eine aktuelle Bonitätsauskunft liegt vor', no: '' },
      wbs: { yes: 'Ein Wohnberechtigungsschein liegt vor', no: '' },
      guarantor: { yes: 'Eine Bürgschaft kann gestellt werden', no: '' },
    },
  },

  en: {
    locale: 'en-GB',
    salutationNamed: (name) => `Dear ${name}`,
    salutationAnonymous: 'Dear Sir or Madam',
    household: (adults, children) =>
      joinHousehold(
        [
          adults > 0 ? (adults === 1 ? '1 adult' : `${adults} adults`) : '',
          children > 0 ? (children === 1 ? '1 child' : `${children} children`) : '',
        ],
        ' and ',
      ),
    employmentType: {
      permanent: 'Permanent',
      temporary: 'Fixed-term',
      selfEmployed: 'Self-employed',
      civilServant: 'Civil servant',
      student: 'In education',
      retired: 'Retired',
    },
    flags: {
      smoker: { yes: '', no: 'The household is non-smoking' },
      schufa: { yes: 'A current credit report is available', no: '' },
      wbs: { yes: 'A housing entitlement certificate is available', no: '' },
      guarantor: { yes: 'A guarantor can be provided', no: '' },
    },
  },

  it: {
    locale: 'it-IT',
    salutationNamed: (name) => `Gentile ${name}`,
    // "Egregi Signori" is masculine-only and reads as 1970s correspondence.
    salutationAnonymous: 'Spettabile Agenzia',
    household: (adults, children) =>
      joinHousehold(
        [
          adults > 0 ? (adults === 1 ? '1 adulto' : `${adults} adulti`) : '',
          children > 0 ? (children === 1 ? '1 bambino' : `${children} bambini`) : '',
        ],
        ' e ',
      ),
    employmentType: {
      permanent: 'Tempo indeterminato',
      temporary: 'Tempo determinato',
      selfEmployed: 'Lavoratore autonomo',
      civilServant: 'Dipendente pubblico',
      student: 'Studente',
      retired: 'Pensionato',
    },
    flags: {
      smoker: { yes: '', no: 'In casa non si fuma' },
      schufa: { yes: 'Posso fornire referenze creditizie', no: '' },
      // Italy has no equivalent of the German WBS, so there is nothing truthful to write here.
      wbs: { yes: '', no: '' },
      guarantor: { yes: 'Posso fornire un garante', no: '' },
    },
  },
};

/** Languages application letters can be written in. */
export const SUPPORTED_LANGUAGES = Object.keys(PHRASES);

/**
 * @param {string} language
 * @returns {LanguagePhrases} Phrases for the language, falling back to English.
 */
export function phrasesFor(language) {
  return PHRASES[language] ?? PHRASES.en;
}
