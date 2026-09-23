/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One line saying what is set behind the household fold.
 *
 * The same idea the job form's filter fold uses: a section that is collapsed by default has to
 * answer "is there anything in here?" without being opened, or people open it every visit to
 * check.
 *
 * Everything summarised here has a working default, which is why it is behind a fold at all -
 * `isProfileComplete` and `isRentProfileComplete` ask for none of it.
 *
 * @param {Object} profile
 * @param {(key: string, params?: Object) => string} t
 * @returns {string}
 */
export function summariseHousehold(profile, t) {
  const parts = [];

  const age = profile?.personA?.age;
  if (age != null) {
    parts.push(t('finance.form.summaryAge', { age: String(age) }));
  }

  if (profile?.personB?.enabled === true) {
    parts.push(t('finance.form.summaryPartner'));
  }

  // The partner's income only counts while the partner does, which is how the income calculation
  // reads it too: switching the partner off keeps the typed value but takes it out of the sums.
  const partnerSecondary = profile?.personB?.enabled === true ? Number(profile?.personB?.secondaryIncome ?? 0) : 0;
  const secondary = Number(profile?.personA?.secondaryIncome ?? 0) + partnerSecondary;
  if (secondary > 0) {
    parts.push(t('finance.form.summarySecondary'));
  }

  if (Number(profile?.existingDebt ?? 0) > 0 || Number(profile?.existingDebtRate ?? 0) > 0) {
    parts.push(t('finance.form.summaryDebt'));
  } else {
    parts.push(t('finance.form.summaryNoDebt'));
  }

  return parts.join(' · ');
}
