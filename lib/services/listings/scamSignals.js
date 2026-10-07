/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { deviationPercent } from './marketBenchmark.js';

/**
 * Reading a listing for the marks a rental scam leaves on it.
 *
 * The German consumer bodies all describe the same handful of frauds, and they all leave traces in
 * the ad itself: a price well under what the street costs to draw people in, a landlord who cannot
 * make a viewing because they are abroad, keys promised by post, and money asked for before anybody
 * has seen the flat. Fredy already stores the description and, since the market benchmark, knows
 * what a square metre costs around every listing, so all of it can be read without a single request
 * leaving the machine.
 *
 * Two rules shape everything below.
 *
 * **A cheap flat is not a scam.** Finding cheap flats is what Fredy is for, and a tool that put a
 * fraud warning on every bargain would be uninstalled within a week. So the price carries weight but
 * never enough on its own: it needs something in the text to agree with it. What does fire alone is
 * language that has no innocent reading in a German rental ad. Nobody legitimate asks for Western
 * Union.
 *
 * **The user always outranks the detector.** Every verdict here is a guess from a word list, and the
 * person reading the ad knows things the word list does not. The stored override wins in both
 * directions, which is why this module never decides anything on its own: it produces signals, and
 * `scamVerdict` weighs them against what the user said.
 */

/**
 * How much each signal contributes, and the score at which a listing is worth warning about.
 *
 * Weights rather than a count, because the signals are not equally telling. Three means "this
 * sentence does not appear in honest ads"; two means "this happens, and it also happens in every
 * scam"; the threshold sits at three so a single three fires and a pair of twos fires, while one two
 * on its own does not.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const SIGNAL_WEIGHTS = Object.freeze({
  advancePayment: 3,
  keysByPost: 3,
  moneyTransferService: 3,
  landlordAbroad: 2,
  noViewing: 2,
  priceFarBelowMarket: 2,
});

/**
 * Every signal there is, in the order they are reported.
 * @type {string[]}
 */
export const SCAM_SIGNALS = Object.freeze(Object.keys(SIGNAL_WEIGHTS));

/**
 * The score from which a listing carries the warning.
 * @type {number}
 */
export const SCAM_SCORE_THRESHOLD = 3;

/**
 * How far under the local median counts as suspiciously cheap.
 *
 * Deliberately far out. Real bargains at thirty percent under are exactly the listings a Fredy user
 * is hunting for, and the figure is measured against a median that is itself only a few hundred
 * listings deep. At forty it is rare enough to be worth noticing and, at weight two, still cannot
 * accuse anybody by itself.
 *
 * @type {number}
 */
export const PRICE_SUSPICION_PCT = -40;

/**
 * What the user said about a listing, overriding whatever the signals say.
 * @type {Readonly<{SCAM: 'scam', SAFE: 'safe'}>}
 */
export const SCAM_OVERRIDES = Object.freeze({ SCAM: 'scam', SAFE: 'safe' });

/**
 * How many words a `*` in a phrase may stand for.
 *
 * German puts things between the words that belong together. "Besichtigung nicht möglich" is written
 * "Besichtigung ist leider nicht möglich" as often as not, and a list of fixed substrings would need
 * an entry for every adverb anybody might reach for. Three is enough for the fillers that actually
 * occur and short enough that a wildcard cannot reach across a sentence boundary and join two
 * unrelated clauses into a false positive.
 *
 * @type {number}
 */
const MAX_WILDCARD_WORDS = 3;

/**
 * The phrases behind each text signal, already in the normalised form {@link normalizeText} produces.
 *
 * Written as prose rather than as expressions: every one of them is a fixed turn of phrase, and a
 * word list that anybody can read and argue with is worth more here than a clever pattern nobody can
 * audit. A `*` stands for up to {@link MAX_WILDCARD_WORDS} words, which is the one concession to
 * word order.
 *
 * Six languages, one per country Fredy can search. German for de, at and the German-speaking half
 * of ch; English because portals and expat landlords write in it everywhere; Italian for casa,
 * subito, tecnocasa, tecnorete and idealista.it; Spanish and Portuguese for the other two idealista
 * sites; French for leboncoin, SeLoger and Bien'ici. The frauds are the same everywhere, which is
 * the point: the same four stories are told in each of these languages, so the lists are
 * translations of one another rather than six separate ideas. French adds the one thing the others
 * lack - its own prepaid vouchers (`transcash`, `neosurf`, `pcs`), which are what a French fraud asks
 * to be paid in where an Italian one asks for a gift card.
 *
 * What is deliberately absent matters as much as what is here:
 *
 * - "kaution" on its own, and "caparra", "fianza" and "caucao" with it. Every rental in every one of
 *   these countries has a deposit; only asking for it before a viewing is a sign of anything.
 * - "besichtigung erst nach" - the usual completion is "Terminvereinbarung", which is how every
 *   honest ad in the country is worded.
 * - "spese di agenzia", "gastos de agencia" and their like. Agency fees are normal and legal in
 *   Italy and Spain, and a signal on them would fire on most of what those portals carry.
 * - an email address or a phone number in the description. Agents put theirs in constantly, and the
 *   signal fired on half the legitimate listings that came from a broker.
 *
 * @type {Readonly<Record<string, string[]>>}
 */
export const SIGNAL_PHRASES = Object.freeze({
  // Anchored to the viewing, almost every one of them, and that anchor is the entire signal. Paying
  // rent before the month it covers is not a fraud, it is how a tenancy works: German law writes it
  // down in section 556b BGB, and Italian, Spanish, Portuguese and English leases all say the same
  // thing in their own words. A list holding the bare phrase warned about the standard clause in
  // every honest advert that quoted it, at the weight that fires on its own.
  //
  // So what is left is of two kinds. Either money wanted before anybody has seen the flat, which no
  // tenancy asks for, or a named fee that does not exist in a legitimate rental at all. The generic
  // "payable in advance", in all five languages, is gone.
  advancePayment: [
    'vorkasse',
    'vorauskasse',
    'kaution im voraus',
    'kaution vorab',
    'anzahlung vor der besichtigung',
    'zahlung vor der besichtigung',
    'kaution vor der besichtigung',
    'reservierungsgebuehr',
    'reservation fee',
    'booking fee',
    'deposit before viewing',
    'deposit before the viewing',
    'payment before viewing',
    'payment before the viewing',
    'pay before viewing',
    'acconto prima della visita',
    'caparra prima della visita',
    'pagamento prima della visita',
    'spese di prenotazione',
    'fianza antes de la visita',
    'senal antes de la visita',
    'pago antes de la visita',
    'gastos de reserva',
    'caucao antes da visita',
    'sinal antes da visita',
    'pagamento antes da visita',
    'taxa de reserva',
    'paiement avant la visite',
    'virement avant la visite',
    'depot de garantie avant la visite',
    // A word of its own (see `compilePhrase`): "par précaution avant la visite" ends in the same
    // letters and is an honest advert asking for a tidy application.
    ' caution avant la visite',
    'acompte avant la visite',
    // Anchored to the viewing, unlike its Spanish and Portuguese siblings: a French résidence with
    // services charges a reservation fee in the open, and the bare phrase warned about every one.
    'frais de reservation avant la visite',
  ],
  keysByPost: [
    'schluessel per post',
    'schluessel zusenden',
    'schluessel zuschicken',
    'schluessel werden zugeschickt',
    'keys by post',
    'keys by mail',
    'send you the keys',
    'send the keys by',
    'ship the keys',
    'chiavi per posta',
    'chiavi per corriere',
    'spedire le chiavi',
    'spedizione delle chiavi',
    'inviare le chiavi',
    'invio delle chiavi',
    'llaves por correo',
    'llaves por mensajeria',
    'enviar las llaves',
    'envio de las llaves',
    'mandar las llaves',
    'chaves pelo correio',
    'chaves por correio',
    'enviar as chaves',
    'envio das chaves',
    'cles par la poste',
    'cles par courrier',
    'cles par colis',
    'envoyer les cles',
    'envoi des cles',
    'expedier les cles',
    'expedition des cles',
    'cles * envoyees par la poste',
    'cles * envoyees par courrier',
    // The older spelling, which is as current in adverts as the other one.
    'clefs par la poste',
    'clefs par courrier',
    'clefs par colis',
    'envoyer les clefs',
    'envoi des clefs',
    'expedier les clefs',
    'expedition des clefs',
    'clefs * envoyees par la poste',
    'clefs * envoyees par courrier',
  ],
  moneyTransferService: [
    'western union',
    'moneygram',
    'money gram',
    'paysafecard',
    'bitcoin',
    'kryptowaehrung',
    'gift card',
    'geschenkkarte',
    'amazon gutschein',
    'criptovaluta',
    'buono regalo',
    'carta regalo',
    'criptomoneda',
    'tarjeta regalo',
    'criptomoeda',
    'cartao presente',
    'vale presente',
    'mandat cash',
    'mandats cash',
    'transcash',
    'neosurf',
    'coupon pcs',
    'coupons pcs',
    'carte cadeau',
    'cartes cadeaux',
    'cryptomonnaie',
    'crypto monnaie',
  ],
  landlordAbroad: [
    'befinde mich * im ausland',
    'bin * im ausland',
    'lebe * im ausland',
    'wohne * im ausland',
    'derzeit im ausland',
    'aus beruflichen gruenden im ausland',
    'currently abroad',
    'i am * abroad',
    'i live abroad',
    'living abroad',
    'out of the country',
    'mi trovo * all estero',
    'sono * all estero',
    'vivo * all estero',
    'attualmente all estero',
    'estoy * en el extranjero',
    'me encuentro * en el extranjero',
    'vivo en el extranjero',
    'actualmente en el extranjero',
    'fuera del pais',
    'estou * no estrangeiro',
    'vivo no estrangeiro',
    'atualmente no estrangeiro',
    'fora do pais',
    'je suis * a l etranger',
    'je vis * a l etranger',
    'je reside * a l etranger',
    'j habite * a l etranger',
    'actuellement a l etranger',
    'mute * a l etranger',
    'mutee * a l etranger',
    'mutes * a l etranger',
    'mutees * a l etranger',
  ],
  noViewing: [
    'ohne besichtigung',
    'keine besichtigung * moeglich',
    'besichtigung * nicht moeglich',
    'without a viewing',
    'without viewing',
    'no viewing * possible',
    'viewing * not possible',
    'senza visita',
    'senza sopralluogo',
    'nessuna visita * possibile',
    'visita non * possibile',
    'visite non * possibili',
    // No bare "sin visita" or "sem visita", for the reason "kaution" is missing above. Spanish and
    // Portuguese adverts say "sin visita previa" and "sem visita previa" to mean the welcome
    // opposite, that you may turn up without an appointment, and the bare phrase warned about them.
    'sin poder visitar',
    'no es posible * visita',
    'visita no * posible',
    'sem poder visitar',
    'nao e possivel * visita',
    'visita nao * possivel',
    // No bare "sans visite" either, for the reason there is no "sin visita": the honest French
    // advert says it to rule the fraud out - "pas de location sans visite", "aucun dossier sans
    // visite préalable" - far more often than a fraud says it at all.
    'sans pouvoir visiter',
    'pas de visite possible',
    'aucune visite * possible',
    'visite * pas possible',
    'visite impossible',
    'visites impossibles',
    'visites * pas possibles',
  ],
});

/**
 * Text as the phrase lists above are written: lower case, umlauts spelled out, accents and
 * apostrophes gone, whitespace collapsed.
 *
 * Four steps, and the order between them is the whole subtlety.
 *
 * German is composed first, because its umlauts have to become two letters rather than one.
 * Portals, landlords and their copy-paste templates disagree about whether it is "Schlüssel" or
 * "Schluessel", and a list carrying both spellings of everything would be twice as long and half as
 * likely to stay right. Composing to NFC beforehand is what makes that reliable: a feed that sends
 * the umlaut decomposed, as a bare "u" with a combining diaeresis after it, looks nothing like "ü"
 * to a replace and would otherwise slip through and end up as a plain "u".
 *
 * The apostrophe goes next, and it is what makes Italian work at all. Elision is not optional there:
 * "all'estero" is how the word is written, so a phrase list without this would have to guess at
 * every contraction a landlord might use. A space is the right replacement rather than nothing,
 * because the two halves are separate words.
 *
 * Then every accent that is left is stripped, which is what Italian, Spanish and Portuguese need for
 * the same reason German needs the step above: "è", "ñ", "ç" and "ã" are typed, dropped and
 * mangled by turns, and a list written without them matches all of those spellings at once. It runs
 * after the German step, never before, or "ü" would collapse to "u" and never reach "ue".
 *
 * @param {string|null|undefined} value
 * @returns {string} The empty string for anything that is not text.
 */
export function normalizeText(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }
  return (
    value
      .normalize('NFC')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/['’‘´`]/g, ' ')
      // A hyphen joins two words that stay two words: "crypto-monnaie", "carte-cadeau",
      // "Western-Union" are written both ways, and the lists spell them apart.
      .replace(/[-‐‑‒–—]/g, ' ')
      .normalize('NFD')
      // The combining marks NFD just split off. Everything else survives untouched.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
  );
}

/**
 * Words that turn the phrase right after them into the thing the advert rules out: "keine
 * Vorkasse", "aucun virement avant la visite", "nicht ohne Besichtigung". Honest adverts warn their
 * readers in exactly the words of the fraud, and a signal that fired on the warning accused them.
 * Normalised like the haystack.
 */
const NEGATORS = new Set([
  // German
  'kein',
  'keine',
  'keinen',
  'keinem',
  'keiner',
  'keinerlei',
  'nicht',
  'nie',
  'niemals',
  'ohne',
  // English
  'no',
  'not',
  'never',
  'without',
  // French
  'aucun',
  'aucune',
  'jamais',
  'pas',
  'sans',
  // Italian
  'nessun',
  'nessuna',
  'nessuno',
  'mai',
  'non',
  'senza',
  // Spanish
  'ningun',
  'ninguna',
  'ninguno',
  'nunca',
  'sin',
  // Portuguese
  'nenhum',
  'nenhuma',
  'nao',
  'sem',
]);

/** Small words that may stand between a negator and the phrase: "pas de", "never any". */
const NEGATION_FILLERS = new Set(['de', 'd', 'di', 'du', 'des', 'any', 'of', 'a', 'an', 'the']);

/**
 * Whether the phrase found at `index` is negated by the word in front of it.
 *
 * Only the word right before it counts, or the one before a filler - never further back, and never
 * across punctuation: "pas de problème, paiement avant la visite" is a fraud asking for money, and a
 * wider reach would have read it as ruled out.
 *
 * @param {string} haystack the normalised text
 * @param {number} index where the phrase starts
 * @returns {boolean}
 */
function negatedAt(haystack, index) {
  const words = haystack
    .slice(Math.max(0, index - 60), index)
    .split(' ')
    .filter(Boolean);
  let word = words.pop();
  if (word != null && NEGATION_FILLERS.has(word)) word = words.pop();
  return word != null && NEGATORS.has(word);
}

/**
 * One phrase, compiled to something that can be asked of a haystack.
 *
 * A phrase without a `*` stays a substring test, which is what almost all of them are and is faster
 * than any expression. One with a `*` becomes a bounded regex; the literal halves are escaped, so a
 * phrase can never smuggle a pattern in by accident.
 *
 * A phrase that starts with a space only matches where a word starts. That is for the few whose first
 * word is the tail of another ("caution" in "précaution"); every other phrase stays a plain substring,
 * which is what lets "schluessel per post" find "Wohnungsschlüssel per Post". Every occurrence the
 * advert negates (see {@link negatedAt}) is passed over.
 *
 * @param {string} phrase
 * @returns {(haystack: string) => boolean}
 */
function compilePhrase(phrase) {
  const wordStart = phrase.startsWith(' ');
  const body = phrase.trim();

  if (!body.includes('*')) {
    const needle = wordStart ? ` ${body}` : body;
    const offset = wordStart ? 1 : 0;
    return (haystack) => {
      for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
        if (!negatedAt(haystack, at + offset)) return true;
      }
      return false;
    };
  }

  const pattern = body
    .split('*')
    .map((part) => part.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join(`(?: \\S+){0,${MAX_WILDCARD_WORDS}} `);
  const expression = new RegExp(`${wordStart ? '(?<=^| )' : ''}${pattern}`, 'g');
  return (haystack) => {
    for (const match of haystack.matchAll(expression)) {
      if (!negatedAt(haystack, match.index)) return true;
    }
    return false;
  };
}

/**
 * Every phrase compiled once, at load, rather than per listing.
 *
 * The migration runs this over every row in the table, and rebuilding the same handful of
 * expressions for each of them is work nothing asks for.
 *
 * @type {Record<string, Array<(haystack: string) => boolean>>}
 */
const COMPILED_PHRASES = Object.fromEntries(
  Object.entries(SIGNAL_PHRASES).map(([signal, phrases]) => [signal, phrases.map(compilePhrase)]),
);

/**
 * The signals a listing shows, in the order {@link SCAM_SIGNALS} lists them.
 *
 * @param {Object|null|undefined} listing A listing row, or a `ParsedListing`. Read for `title`,
 *   `description`, `price_per_sqm` and `market_median_sqm`.
 * @returns {string[]} Signal ids, empty when nothing fired.
 */
export function detectScamSignals(listing) {
  if (listing == null) {
    return [];
  }

  // Title and description together: the price bait usually lives in the headline and the story
  // about the keys in the body, and neither half is worth reading on its own.
  // Led by a space, so a phrase that has to start a word can start the title too.
  const haystack = ` ${normalizeText(listing.title)} ${normalizeText(listing.description)}`;
  const found = [];

  for (const signal of SCAM_SIGNALS) {
    const matchers = COMPILED_PHRASES[signal];
    if (matchers == null) {
      continue;
    }
    if (matchers.some((matches) => matches(haystack))) {
      found.push(signal);
    }
  }

  // The one signal that is a number rather than a sentence. It needs the market benchmark, so a
  // listing Fredy could not place, or one in an area it has too few listings for, simply does not
  // show it - which is the right answer rather than a missing one, since without neighbours there
  // is nothing to be suspiciously cheap against.
  const percent = deviationPercent(listing.price_per_sqm, listing.market_median_sqm);
  if (percent != null && percent <= PRICE_SUSPICION_PCT) {
    found.push('priceFarBelowMarket');
  }

  return found;
}

/**
 * What the signals add up to.
 *
 * @param {string[]|null|undefined} signals
 * @returns {number}
 */
export function scamScore(signals) {
  if (!Array.isArray(signals)) {
    return 0;
  }
  return signals.reduce((total, signal) => total + (SIGNAL_WEIGHTS[signal] ?? 0), 0);
}

/**
 * Whether a listing is worth warning about, and why.
 *
 * The override is checked first and answers on its own. A user who has looked at the ad and called
 * it a scam is not arguing with the word list, and one who has called it safe has already read
 * whatever the word list found. Neither needs the score recomputing to disagree with them.
 *
 * @param {string[]|null|undefined} signals From {@link detectScamSignals}.
 * @param {('scam'|'safe'|null|undefined)} override What the user said, if anything.
 * @returns {{suspicious: boolean, score: number, signals: string[], source: ('user'|'signals')}}
 */
export function scamVerdict(signals, override = null) {
  const found = Array.isArray(signals) ? signals : [];
  const score = scamScore(found);

  if (override === SCAM_OVERRIDES.SCAM) {
    return { suspicious: true, score, signals: found, source: 'user' };
  }
  if (override === SCAM_OVERRIDES.SAFE) {
    return { suspicious: false, score, signals: found, source: 'user' };
  }
  return { suspicious: score >= SCAM_SCORE_THRESHOLD, score, signals: found, source: 'signals' };
}
