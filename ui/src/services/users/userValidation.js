/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * What a user account needs before it can be saved.
 *
 * Named rules rather than one boolean, for the same reason `jobValidation.js` has them: each rule
 * stands on its own, is tested on its own, and carries the field it belongs to, so the form can
 * put the message where the mistake is instead of dropping a toast in the corner.
 *
 * `mode` is the whole reason this file is not four `if`s in the component. A password is mandatory
 * for a new account and optional for an existing one, because leaving it empty means "keep the one
 * that is stored" - which is what `userStorage.upsertUser` has always done and what the route
 * refused to allow until this change.
 */

/**
 * @typedef {Object} UserProblem
 * @property {string} key Stable identifier, used in tests and to pick the message.
 * @property {'username'|'password'|'password2'} field Where the message belongs.
 */

/**
 * Everything wrong with a draft account, in the order the fields appear.
 *
 * @param {Object} draft
 * @param {string} draft.username
 * @param {string} draft.password
 * @param {string} draft.password2
 * @param {'create'|'edit'} draft.mode
 * @returns {UserProblem[]} Empty when the account can be saved.
 */
export function userProblems({ username, password, password2, mode } = {}) {
  const problems = [];

  if (typeof username !== 'string' || username.trim().length === 0) {
    problems.push({ key: 'usernameMissing', field: 'username' });
  }

  // Empty on an edit means "keep the stored password". Empty on a create means there would be
  // none at all.
  if (mode === 'create' && (password ?? '').length === 0) {
    problems.push({ key: 'passwordMissing', field: 'password' });
  }

  // Checked whichever mode this is: somebody who typed into one of the two fields meant to change
  // the password, and a silent mismatch is the one mistake this form can make that nobody notices
  // until the person cannot log in.
  if ((password ?? '') !== (password2 ?? '')) {
    problems.push({ key: 'passwordMismatch', field: 'password2' });
  }

  return problems;
}

/**
 * Whether a draft account can be saved.
 *
 * @param {Object} draft
 * @returns {boolean}
 */
export function canSaveUser(draft) {
  return userProblems(draft).length === 0;
}

/**
 * The first problem on a given field, if any.
 *
 * @param {UserProblem[]} problems
 * @param {string} field
 * @returns {UserProblem|undefined}
 */
export function problemOn(problems, field) {
  return problems.find((problem) => problem.field === field);
}
