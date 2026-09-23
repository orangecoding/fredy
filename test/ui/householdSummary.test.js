/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import { summariseHousehold } from '../../ui/src/services/finance/householdSummary.js';

/** Returns the key itself, so what is asserted is which facts are reported, not their wording. */
const t = (key) => key;

describe('summariseHousehold', () => {
  it('says the age and that there is no debt, for an untouched household', () => {
    const line = summariseHousehold({ personA: { age: 35 } }, t);
    expect(line).toContain('finance.form.summaryAge');
    expect(line).toContain('finance.form.summaryNoDebt');
  });

  it('mentions a partner only once one is switched on', () => {
    expect(summariseHousehold({ personB: { enabled: false } }, t)).not.toContain('summaryPartner');
    expect(summariseHousehold({ personB: { enabled: true } }, t)).toContain('summaryPartner');
  });

  it('counts a second income from either person', () => {
    expect(summariseHousehold({ personA: { secondaryIncome: 200 } }, t)).toContain('summarySecondary');
    expect(summariseHousehold({ personB: { enabled: true, secondaryIncome: 200 } }, t)).toContain('summarySecondary');
  });

  // Switching the partner off keeps what was typed but takes it out of every sum, and the income
  // calculation (`activePersons`) reads it the same way.
  it("ignores a switched-off partner's second income", () => {
    expect(summariseHousehold({ personB: { enabled: false, secondaryIncome: 400 } }, t)).not.toContain(
      'summarySecondary',
    );
  });

  // A loan with a balance but no instalment yet is still a loan the user has started entering.
  it.each([{ existingDebt: 8000 }, { existingDebtRate: 190 }])('reports debt for %o', (profile) => {
    expect(summariseHousehold(profile, t)).toContain('finance.form.summaryDebt');
  });

  it('survives being handed nothing', () => {
    expect(() => summariseHousehold(null, t)).not.toThrow();
    expect(() => summariseHousehold(undefined, t)).not.toThrow();
  });
});
