/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

class ExtendableError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}
class NoNewListingsWarning extends ExtendableError {}
/** A price bound was put on listings priced in several currencies, where it has no one unit. */
class MixedCurrencyError extends ExtendableError {
  constructor() {
    super('Select one currency before filtering by price.');
  }
}
export { NoNewListingsWarning, MixedCurrencyError };
export default {
  NoNewListingsWarning,
  MixedCurrencyError,
};
