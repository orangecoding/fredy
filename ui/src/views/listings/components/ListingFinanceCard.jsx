/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Typography } from '@douyinfe/semi-ui-19';
import { IconArrowRight } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router-dom';

import VerdictBanner from '../../finance/components/VerdictBanner.jsx';
import ListingPayoffChart from '../../finance/charts/ListingPayoffChart.jsx';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { useActions } from '../../../services/state/store.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './ListingFinanceCard.less';

const { Text, Title } = Typography;

/**
 * What this particular property costs the household every month.
 *
 * For a purchase that means the loan: instalment, term, Restschuld. For a rental it means the
 * warm rent against the same budget - no loan, no amortization, so a much shorter card. Which
 * one is shown follows the deal type of the job that found the listing.
 *
 * The figures come from `GET /api/finance/listing/:id`, which runs the same core the calculator
 * and the affordability filter run. The browser used to compute this itself from a copy of the
 * finance modules; the copy is gone, because two implementations of the same amortization scoring
 * the same listing is a contradiction waiting to be shipped.
 *
 * @param {Object} props
 * @param {{id: string, price: number, dealType?: 'rent'|'buy'}} props.listing
 */
export default function ListingFinanceCard({ listing }) {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const actions = useActions();
  const [finance, setFinance] = React.useState(null);
  const isRental = listing?.dealType === 'rent';

  React.useEffect(() => {
    if (listing?.id == null || listing?.price == null) {
      setFinance(null);
      return undefined;
    }
    let cancelled = false;
    actions.finance.getListingFinance(listing.id).then((payload) => {
      if (!cancelled) setFinance(payload);
    });
    return () => {
      cancelled = true;
    };
  }, [listing?.id, listing?.price]);

  if (isRental) {
    return finance?.scored == null ? null : (
      <RentCard scored={finance.scored} budget={finance.budget} t={t} locale={locale} />
    );
  }

  // No profile, no price, or nothing loaded yet: stay out of the way entirely rather than showing
  // an empty widget or nagging for setup.
  const result = finance?.result ?? null;
  if (result == null) {
    return null;
  }

  const primary = result.financing.primary;
  const debtFree = result.debtFreeAges
    .filter((person) => person.ageWhenDebtFree != null)
    .map((person) => `${person.label} ${person.ageWhenDebtFree}`)
    .join(' · ');

  const facts = [
    [t('finance.kpi.monthlyRate'), formatEuro(primary.monthlyPayment, locale), true],
    [
      t('finance.kpi.payoff'),
      primary.payoffMonths == null
        ? t('finance.kpi.never')
        : t('finance.kpi.yearsValue', { years: (primary.payoffMonths / 12).toFixed(1) }),
      false,
    ],
    [t('finance.kpi.debtFreeAge'), debtFree || '-', false],
    [t('listing.detail.financeLoan'), formatEuro(result.financing.loanAmount, locale), false],
    [
      t('finance.kpi.restschuld'),
      formatEuro(primary.restschuld, locale),
      false,
      t('listing.detail.financeAfterYears', { years: String(primary.fixedYears) }),
    ],
    [t('finance.kpi.totalInterest'), formatEuro(primary.totalInterest, locale), false],
  ];

  return (
    <section className="listingFinance">
      <div className="listingFinance__header">
        {/* Same heading level as "Details" and "Description" - it is a section of the page,
            not a widget bolted onto one. */}
        <Title heading={4} className="listingFinance__title">
          {t('listing.detail.financeTitle')}
        </Title>
        <Button
          theme="borderless"
          size="small"
          icon={<IconArrowRight />}
          iconPosition="right"
          onClick={() => navigate(`/finance?dealType=buy&price=${listing.price}&listingId=${listing.id}`)}
        >
          {t('listing.detail.financeOpenCalculator')}
        </Button>
      </div>

      <VerdictBanner
        compact
        verdict={result.verdict}
        share={result.rateShareOfNetIncome}
        monthlyRate={primary.monthlyPayment}
        recommendedRate={result.recommendation.recommendedRate}
        maxPrice={result.recommendation.maxAffordablePrice}
      />

      <dl className="listingFinance__facts">
        {facts.map(([label, value, emphasis, note]) => (
          <div className={`listingFinance__fact${emphasis ? ' listingFinance__fact--emphasis' : ''}`} key={label}>
            <dt className="listingFinance__fact-label">{label}</dt>
            <dd className="listingFinance__fact-value">{value}</dd>
            {note && <dd className="listingFinance__fact-note">{note}</dd>}
          </div>
        ))}
      </dl>

      <div className="listingFinance__chart">
        <ListingPayoffChart scenario={primary} currentAge={finance?.profile?.personA?.age ?? null} />
      </div>

      <Text type="tertiary" size="small" className="listingFinance__footnote">
        {t('listing.detail.financeFootnote', {
          rate: String(primary.annualRate),
          tilgung: String(primary.tilgung),
        })}
      </Text>
    </section>
  );
}

/**
 * The rental variant: what leaves the account each month, and what is left afterwards.
 *
 * @param {Object} props
 * @param {import('../../../types/finance.js').RentAffordability} props.scored
 * @param {import('../../../types/finance.js').Budget} props.budget
 * @param {(key: string, params?: Object) => string} props.t
 * @param {string} props.locale
 */
function RentCard({ scored, budget, t, locale }) {
  const navigate = useNavigate();

  const facts = [
    [t('listing.detail.rentWarm'), formatEuro(scored.warmRent, locale), true],
    [t('listing.detail.rentCold'), formatEuro(scored.coldRent, locale), false],
    [
      t('listing.detail.rentNebenkosten'),
      formatEuro(scored.nebenkosten, locale),
      false,
      t('listing.detail.rentNebenkostenNote'),
    ],
    [t('listing.detail.rentShare'), `${((scored.rateShareOfNetIncome ?? 0) * 100).toFixed(1)} %`, false],
    [t('listing.detail.rentRemaining'), formatEuro(scored.remainingAfterRent, locale), false],
    [t('listing.detail.rentCeiling'), formatEuro(budget.headroom, locale), false],
  ];

  return (
    <section className="listingFinance">
      <div className="listingFinance__header">
        <Title heading={4} className="listingFinance__title">
          {t('listing.detail.rentTitle')}
        </Title>
        <Button
          theme="borderless"
          size="small"
          icon={<IconArrowRight />}
          iconPosition="right"
          onClick={() => navigate('/finance')}
        >
          {t('listing.detail.financeOpenCalculator')}
        </Button>
      </div>

      <VerdictBanner
        compact
        verdict={scored.verdict}
        share={scored.rateShareOfNetIncome}
        monthlyRate={scored.warmRent}
        advice={
          scored.verdict === 'affordable'
            ? null
            : t('listing.detail.rentAdvice', { rate: formatEuro(budget.headroom, locale) })
        }
      />

      <dl className="listingFinance__facts">
        {facts.map(([label, value, emphasis, note]) => (
          <div className={`listingFinance__fact${emphasis ? ' listingFinance__fact--emphasis' : ''}`} key={label}>
            <dt className="listingFinance__fact-label">{label}</dt>
            <dd className="listingFinance__fact-value">{value}</dd>
            {note && <dd className="listingFinance__fact-note">{note}</dd>}
          </div>
        ))}
      </dl>

      <Text type="tertiary" size="small" className="listingFinance__footnote">
        {t('listing.detail.rentFootnote', { pct: String(Math.round(scored.nebenkostenPct ?? 0)) })}
      </Text>
    </section>
  );
}

ListingFinanceCard.displayName = 'ListingFinanceCard';
