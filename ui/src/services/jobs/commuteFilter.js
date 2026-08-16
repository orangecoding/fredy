/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The shape of a job's commute filter, as the browser needs to know it.
 *
 * Deliberately a copy of the halves of `lib/utils/commuteBudget.js` that the form needs, rather than
 * an import: the frontend may not reach into server code (see the eslint rule). The server
 * normalises again on the way in, so this is what the user sees rather than what is enforced.
 */

/**
 * What a job does with a listing that is further away than it asked for, in the order offered.
 *
 * Least destructive first, because that is the order somebody reads a list of consequences in.
 * @type {string[]}
 */
export const COMMUTE_ACTIONS = ['mark', 'notify', 'exclude'];

/**
 * The action a filter gets when it names none.
 *
 * `notify` rather than `mark`: a limit is typed by somebody who does not want to hear about flats
 * past it, so defaulting to the option that changes nothing would make the field a no-op until a
 * second one is found and set.
 * @type {string}
 */
export const DEFAULT_COMMUTE_ACTION = 'notify';

/**
 * What a typed limit means once it leaves the field.
 *
 * Semi hands back an empty string when the box is cleared and a partially typed value while it is
 * being typed. Both read as "no limit on this address" rather than as a zero, so clearing a box
 * really does remove that address from the filter instead of demanding the impossible of it.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function toCommuteLimit(value) {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * How many addresses a filter puts a limit on.
 *
 * @param {{limits?: Record<string, number>}|null|undefined} commuteFilter
 * @returns {number}
 */
export function countCommuteLimits(commuteFilter) {
  const limits = commuteFilter?.limits;
  return limits == null || typeof limits !== 'object' ? 0 : Object.keys(limits).length;
}

/**
 * Every address the user has saved, whether it resolved to coordinates or not.
 *
 * Deliberately not `getAddresses` from utils, which drops the ones whose geocode came back empty.
 * That filter is right for the map and the badges, which have nothing to draw without coordinates,
 * and wrong for the form: a limit is set against a *name*, the Settings page lists an address
 * whether it resolved or not, and hiding one from the form would report the user's own address as
 * missing and then clear the limit they had set on it. An address that never resolved simply never
 * gets a travel time, and a limit with no travel time holds nothing back.
 *
 * @param {Object|null|undefined} settings - The user settings blob.
 * @returns {Array<Object>}
 */
export function savedAddresses(settings) {
  const raw = Array.isArray(settings?.home_addresses) ? settings.home_addresses : [];
  return raw.filter((address) => typeof address?.label === 'string' && address.label.trim().length > 0);
}

/**
 * The limits naming an address that is not there any more.
 *
 * Worth its own function because of what the form does with the answer: it warns about these, and
 * then deletes them the next time anything in the section is touched. A label wrongly counted here
 * is a limit the user set and watched disappear, so the comparison is against the addresses as
 * stored rather than against whatever subset a screen happens to render.
 *
 * @param {Record<string, number>|null|undefined} limits - Keyed by address label.
 * @param {Array<Object>|null|undefined} addresses - From {@link savedAddresses}.
 * @returns {string[]}
 */
export function orphanedCommuteLabels(limits, addresses) {
  const saved = new Set((Array.isArray(addresses) ? addresses : []).map((address) => address?.label));
  return Object.keys(limits ?? {}).filter((label) => !saved.has(label));
}
