/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const page = read('ui/src/views/finance/FinanceCalculator.jsx');
const pageLess = read('ui/src/views/finance/FinanceCalculator.less');
const formsLess = read('ui/src/views/finance/components/FinanceForms.less');
const profileForm = read('ui/src/views/finance/components/ProfileForm.jsx');
const headline = read('ui/src/views/finance/components/HouseholdHeadline.jsx');
const headlineLess = read('ui/src/views/finance/components/HouseholdHeadline.less');
const property = read('ui/src/views/finance/components/PropertyForm.jsx');
const summary = read('ui/src/views/finance/components/ResultSummary.jsx');
const rentLess = read('ui/src/views/finance/components/RentPanel.less');
const core = read('lib/services/finance/affordability.js');

const LESS_FILES = [
  ['FinanceCalculator', pageLess],
  ['FinanceForms', formsLess],
  ['HouseholdHeadline', headlineLess],
  ['RentPanel', rentLess],
];

describe('the two numbers that decide come first', () => {
  it('asks for income and living costs in the open', () => {
    expect(headline).toMatch(/finance\.form\.primaryIncome/);
    expect(headline).toMatch(/finance\.form\.livingCosts/);
  });

  it('folds everything the core does not ask for', () => {
    expect(page).toMatch(/finance__householdMore/);
    expect(page).toMatch(/summariseHousehold\(draft, t\)/);
    // The fold says what is inside without being opened.
    expect(page).toMatch(/finance__foldSummary/);
  });

  // The claim the whole plan rests on. If the core ever asks for more, this fails and the fold
  // has to be reopened.
  it('still holds: renting needs net income and living costs, nothing else', () => {
    const block = core.match(/export function isRentProfileComplete[\s\S]*?\n\}/)[0];
    expect(block).toMatch(/netIncomeOf\(profile\) <= 0/);
    expect(block).toMatch(/profile\.livingCosts != null/);
    expect(block).not.toMatch(/\.age\b/);
    expect(block).not.toMatch(/existingDebt/);
  });

  it('answers as soon as both are there', () => {
    expect(headline).toMatch(/finance\.form\.housingBudget/);
    expect(headline).toMatch(/householdHeadline__bar/);
  });
});

describe('one label treatment, one help container', () => {
  it('no longer sets field names in spaced uppercase', () => {
    const block = formsLess.match(/&__label \{[\s\S]*?\n  \}/)[0];
    expect(block).not.toMatch(/text-transform/);
    expect(block).not.toMatch(/letter-spacing/);
    expect(block).toMatch(/font-size: @text-sm/);
    expect(block).toMatch(/color: @color-text/);
  });

  it('puts three sentences in a popover, not a tooltip', () => {
    expect(profileForm).toMatch(/<Popover/);
    expect(profileForm).not.toMatch(/<Tooltip/);
  });
});

describe('a field is a settings row, not a caption over a full-width box', () => {
  // The same row the settings and admin pages are built from, rather than a second one that looks
  // almost like it. Its stylesheet is also what takes Semi's four nested boxes apart, which is why
  // the euro sign used to sit on the card's edge instead of inside the input.
  it('builds every input on AdminField', () => {
    expect(profileForm).toMatch(/import AdminField from/);
    expect(profileForm).toMatch(/<AdminField/);
    expect(property).toMatch(/<AdminField/);
  });

  it('gives the row a control to label', () => {
    expect(profileForm).toMatch(/useId\(\)/);
    expect(profileForm).toMatch(/htmlFor=\{id\}/);
  });

  it('stacks the fields instead of putting them in a grid', () => {
    const block = formsLess.match(/&__fields \{[\s\S]*?\n  \}/)[0];
    expect(block).toMatch(/flex-direction: column/);
    for (const [name, source] of [
      ['ProfileForm', profileForm],
      ['PropertyForm', property],
      ['HouseholdHeadline', headline],
    ]) {
      expect(source, name).not.toMatch(/financeForm__grid/);
    }
  });
});

describe('saving works the way the settings pages save', () => {
  it('has one sticky bar and no Save button inside a tab', () => {
    expect(page).toMatch(/<SettingsSaveBar/);
    expect(page).not.toMatch(/SectionActions/);
  });

  // A form that saves itself on blur and a bar that says "unsaved changes" cannot both be telling
  // the truth, so the autosave went with the Save button.
  it('no longer saves on blur behind the user', () => {
    expect(page).not.toMatch(/autoSaveSection/);
    expect(page).not.toMatch(/onBlur=/);
  });

  it('drives the bar off a comparison, not a touched flag', () => {
    expect(page).toMatch(/financeDirtyState\(draft, storedProfile\)/);
    expect(page).toMatch(/isSectionDirty\(dirtyState, activeTab\)/);
  });

  it('offers a way back out of a half-finished edit', () => {
    expect(page).toMatch(/onDiscard=\{discard\}/);
    expect(page).toMatch(/const discard = \(\) => \{/);
  });

  // Every part, not only the tab on screen: edits left on the other tab are just as unsaved.
  it('warns before the page is left with something unsaved', () => {
    expect(page).toMatch(/useUnsavedWarning\(dirtyState\.household \|\| dirtyState\.rent \|\| dirtyState\.buy\)/);
  });

  // A tab never saved can be complete on the defaults alone and then equals what is "stored"; the
  // bar holds the only Save, so it has to show for such a tab too.
  it('offers Save for a complete tab that was never saved, even when nothing differs', () => {
    expect(page).toMatch(/const showSaveBar = dirty \|\| \(canSave && !tabSaved\);/);
    expect(page).toMatch(/dirty=\{showSaveBar\}/);
  });

  // A Save that refuses without saying why is what the bar's `status` slot exists to avoid.
  it('says which figures are missing when it will not save', () => {
    expect(page).toMatch(/saveDisabled=\{!canSave\}/);
    expect(page).toMatch(/finance\.saveBlockedRent/);
    expect(page).toMatch(/finance\.saveBlockedBuy/);
  });

  it('keeps Delete beside the half it removes', () => {
    expect(page).toMatch(/<SectionDelete/);
    expect(page).toMatch(/finance\.delete\.confirmTitleRent/);
    expect(pageLess).toMatch(/&__delete-row \{/);
  });
});

describe('everything on this page passes AA', () => {
  // Declarations only, not mentions: the rules that replaced @color-faint name it in their comment,
  // because "this used to be the faint grey and measured 2,47:1" is the reason they read the way
  // they do. A bare /@color-faint/ would fail on the explanation for the fix.
  it.each(LESS_FILES)('%s sets no @color-faint', (_name, source) => {
    expect(source).not.toMatch(/:\s*@color-faint\b/);
  });
});

describe('the page opens with one line, not four blocks', () => {
  it('drops the rule from the top and hands it to the card that applies it', () => {
    expect(page).not.toMatch(/finance\.rule\.label/);
    expect(pageLess).not.toMatch(/&__rule\b/);
    expect(headline).toMatch(/helpText=\{t\('finance\.rule\.body'\)\}/);
  });

  it('moves the caveat to the foot of the page', () => {
    expect(page).toMatch(/finance__disclaimer/);
    expect(pageLess).toMatch(/&__disclaimer \{[\s\S]*?color: @color-muted/);
  });
});

describe('the answer is an answer', () => {
  it('keeps two cards and turns the other four into rows', () => {
    expect([...summary.matchAll(/<KpiCard/g)]).toHaveLength(2);
    expect(summary).toMatch(/financeForm__readout-row/);
  });

  it('renders no rows at all rather than four dashes', () => {
    expect(summary).toMatch(/const rows = !hasLoan\s*\n?\s*\? \[\]/);
  });

  it('keeps the verdict banner exactly as it was', () => {
    expect(summary).toMatch(/<VerdictBanner/);
    expect(summary).toMatch(/rateAboveCeiling/);
  });
});

describe("Semi's floats are handled in both places, not one", () => {
  it.each(['&__kpi-row', '&__split'])('%s takes the columns out of the float flow', (selector) => {
    const block = pageLess.match(new RegExp(`\\${selector} \\{[\\s\\S]*?\\n  \\}`));
    expect(block, selector).not.toBeNull();
    expect(block[0]).toMatch(/float: none/);
  });
});

describe('the two data-driven inline colours stay', () => {
  it('keeps the scenario swatch and the verdict colour', () => {
    const scenario = read('ui/src/views/finance/components/ScenarioForm.jsx');
    const verdict = read('ui/src/views/finance/components/VerdictBanner.jsx');
    expect(scenario).toMatch(/backgroundColor: palette\[index % palette\.length\]/);
    expect(verdict).toMatch(/VERDICT_COLORS/);
  });

  it('and nothing else sets colour or spacing inline', () => {
    for (const [name, source] of [
      ['FinanceCalculator', page],
      ['ProfileForm', profileForm],
      ['PropertyForm', property],
      ['ResultSummary', summary],
    ]) {
      expect(source, name).not.toMatch(/style=\{\{[^}]*\b(color|margin|padding|gap|fontSize)\b/);
    }
  });
});

describe('the closing-cost rates are folded, the price is not', () => {
  it('keeps price, equity and Bundesland in the open', () => {
    expect(property).toMatch(/finance\.form\.purchasePrice/);
    expect(property).toMatch(/finance\.form\.equity/);
    expect(property).toMatch(/finance\.form\.bundesland/);
  });

  it('folds the three percentages behind a summary of what they add up to', () => {
    expect(property).toMatch(/propertyForm__rates/);
    expect(property).toMatch(/finance\.form\.ratesSummary/);
  });
});

describe('the numbers themselves were not touched', () => {
  it('leaves the finance core alone', () => {
    // A guard, not an assertion about behaviour: this plan is a UI plan, and the one thing it must
    // not do is quietly change what a verdict means.
    expect(core).toMatch(/export function isProfileComplete/);
    expect(core).toMatch(/export function isRentProfileComplete/);
    expect(page).not.toMatch(/0\.35|0\.4\b/);
  });
});
