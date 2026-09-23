/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { SegmentPart } from '../../../components/segment/SegmentPart.jsx';
import { NumberField } from './ProfileForm.jsx';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './HouseholdHeadline.less';

/**
 * The two numbers this page cannot do without, and what they immediately buy.
 *
 * `isRentProfileComplete` asks for exactly these two (affordability.js:428); `isProfileComplete`
 * adds equity and nothing else, because Bundesland, notary, Makler, Nebenkosten and three rate
 * scenarios all arrive from `defaultProfile()`. Everything else the household knows has a working
 * default and sits behind the fold below.
 *
 * The readout is the payoff for answering: two numbers in, one number out, before any tab is
 * chosen. It is a CSS bar rather than a chart - `BudgetChart` says the same thing in detail
 * further down, and a second canvas up here would be the same answer twice.
 *
 * @param {Object} props
 * @param {import('../../../types/finance.js').FinanceProfile} props.profile
 * @param {Object|null} props.budget `computeBudget`'s output for the current draft, straight from
 *   the server: `{ netIncome, livingCosts, existingDebtRate, disposable, ruleCap, stretchCap,
 *   headroom, stretchHeadroom }`.
 * @param {number|null} props.housingBudget `recommendation.recommendedRate` from the same payload -
 *   `max(0, min(headroom, disposable - safetyBuffer))`, computed by `recommendRate` and
 *   independent of any loan. Not derived here: this browser does no finance math.
 * @param {(patch: Object) => void} props.onChange
 * @param {(patch: Object) => void} props.onPersonChange Patches personA.
 * @returns {React.ReactElement}
 */
export default function HouseholdHeadline({ profile, budget, housingBudget, onChange, onPersonChange }) {
  const t = useTranslation();
  const locale = useLocale();

  const net = budget?.netIncome ?? 0;
  const living = budget?.livingCosts ?? 0;
  const ready = net > 0 && profile?.livingCosts != null;

  // Three server-computed amounts expressed as three widths. Turning euros into percentages of the
  // same income is presentation, not finance - no threshold and no rule is applied here.
  const pct = (amount) => (net > 0 ? Math.max(0, Math.min(100, (amount / net) * 100)) : 0);
  const rulePct = pct(housingBudget ?? 0);
  const livingPct = Math.min(100 - rulePct, pct(living));

  return (
    <SegmentPart
      name={t('finance.form.householdTitle')}
      // The 35 % rule, moved off the top of the page and behind the mark of the card that applies
      // it. Above the first field it was the answer to a question nobody had asked yet.
      helpText={t('finance.rule.body')}
      helpMode="popover"
      action={<span className="financeStep">{t('finance.form.step', { n: '1' })}</span>}
    >
      <div className="financeForm__fields">
        {/* Optional chain because `EMPTY_DRAFT` in FinanceCalculator carries no `personA`: it is
            what the page renders against if the profile-summary request fails, and this card is
            always on screen. */}
        <NumberField
          label={t('finance.form.primaryIncome')}
          value={profile?.personA?.primaryIncome}
          step={50}
          suffix="€"
          help={t('finance.form.primaryIncomeHelp')}
          onChange={(primaryIncome) => onPersonChange({ primaryIncome })}
        />
        <NumberField
          label={t('finance.form.livingCosts')}
          value={profile?.livingCosts}
          step={50}
          suffix="€"
          allowEmpty
          help={t('finance.form.livingCostsHelp')}
          onChange={(livingCosts) => onChange({ livingCosts })}
        />
      </div>

      <div className="householdHeadline__readout">
        {ready ? (
          <>
            <div className="householdHeadline__row">
              <span className="householdHeadline__caption">{t('finance.form.housingBudget')}</span>
              <span className="householdHeadline__value">{formatEuro(housingBudget ?? 0, locale)}</span>
            </div>
            <div className="householdHeadline__bar" aria-hidden="true">
              <span className="householdHeadline__seg householdHeadline__seg--rule" style={{ width: `${rulePct}%` }} />
              <span
                className="householdHeadline__seg householdHeadline__seg--living"
                style={{ width: `${livingPct}%` }}
              />
            </div>
            <div className="householdHeadline__legend">
              <span>{t('finance.form.legendRule')}</span>
              <span>{t('finance.form.legendLiving')}</span>
              <span>{t('finance.form.legendBuffer')}</span>
            </div>
          </>
        ) : (
          <p className="householdHeadline__prompt">{t('finance.form.needsTwoNumbers')}</p>
        )}
      </div>
    </SegmentPart>
  );
}

HouseholdHeadline.displayName = 'HouseholdHeadline';
