/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The guard against a caller-sent object that is not a plain one.
 *
 * Every shared save that copies keys out of an object a caller sent - a channel's field bag, a
 * settings patch - skips the same unsafe keys for the same reason, so the rule lives here once
 * rather than as a copy in each of them.
 */

/**
 * Keys never copied out of an object a caller sent. Assigned onto a plain object, an own `__proto__`
 * key - which `JSON.parse` happily produces - would replace the object's prototype instead of
 * setting a field.
 *
 * @type {Set<string>}
 */
export const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Whether a value is a plain object rather than an array or a primitive - the shape a patch or a
 * field bag must have before any key of it is worth looking at.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export const isPlainObject = (value) => value != null && typeof value === 'object' && !Array.isArray(value);
