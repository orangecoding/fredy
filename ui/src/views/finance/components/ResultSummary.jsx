/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Col, Row } from '@douyinfe/semi-ui-19';
import { IconCreditCard, IconHome, IconTickCircle, IconUser } from '@douyinfe/semi-icons';
import IconEuro from '../../../components/icons/IconEuro.jsx';

import KpiCard from '../../../components/cards/KpiCard.jsx';
import VerdictBanner from './VerdictBanner.jsx';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
 * The answer, before the charts that justify it.
 *
 * @param {Object} props
 * @param {Object} props.result Output of computeFinanceResult.
 */
export default function ResultSummary({ result }) {
  const t = useTranslation();
  const locale = useLocale();

  if (result == null) {
    return null;
  }

  const primary = result.financing.primary;
  const debtFree = result.debtFreeAges
    .filter((person) => person.ageWhenDebtFree != null)
    .map((person) => `${person.label} ${person.ageWhenDebtFree}`)
    .join(' · ');

  const payoff =
    primary.payoffMonths == null
      ? t('finance.kpi.never')
      : t('finance.kpi.yearsValue', { years: (primary.payoffMonths / 12).toFixed(1) });

  // A KPI computed from nothing is a lie dressed as a figure: "€0 a month" and "0 % of your
  // net income" read as answers, when in fact the question has not been asked yet. Each card
  // says so instead, naming the input it is still waiting for.
  const noData = t('finance.noData');
  const hasLoan = result.financing.loanAmount > 0;
  const hasIncome = (result.budget?.netIncome ?? 0) > 0;
  const loanValue = (value) => (hasLoan ? value : noData);

  return (
    <>
      {hasIncome && hasLoan && (
        <VerdictBanner
          verdict={result.verdict}
          share={result.rateShareOfNetIncome}
          monthlyRate={primary.monthlyPayment}
          recommendedRate={result.recommendation.recommendedRate}
          maxPrice={result.recommendation.maxAffordablePrice}
          // A verdict of "affordable" normally needs no advice. It still does when the chosen
          // instalment sits above the recommended rate: it clears the 35 % rule only by eating
          // into the safety buffer, and that is the one thing the verdict alone does not say.
          // Said here rather than in a second banner of its own, so the page has one verdict.
          advice={
            result.verdict === 'affordable' && result.rateAboveCeiling
              ? t('finance.warning.rateAboveAffordable', {
                  ceiling: formatEuro(result.recommendation.recommendedRate, locale),
                })
              : undefined
          }
        />
      )}

      <Row gutter={[16, 16]} className="finance__kpi-row">
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('finance.kpi.monthlyRate')}
            color="orange"
            value={loanValue(formatEuro(primary.monthlyPayment, locale))}
            icon={<IconEuro />}
            description={t('finance.kpi.monthlyRateDesc', { tilgung: String(primary.tilgung) })}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('finance.kpi.payoff')}
            color="blue"
            value={loanValue(payoff)}
            icon={<IconHome />}
            description={t('finance.kpi.payoffDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('finance.kpi.debtFreeAge')}
            color="green"
            value={loanValue(debtFree || '-')}
            icon={<IconUser />}
            description={t('finance.kpi.debtFreeAgeDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('finance.kpi.restschuld')}
            color="purple"
            value={loanValue(formatEuro(primary.restschuld, locale))}
            icon={<IconCreditCard />}
            description={t('finance.kpi.restschuldDesc', { years: String(primary.fixedYears) })}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('finance.kpi.totalInterest')}
            value={loanValue(formatEuro(primary.totalInterest, locale))}
            icon={<IconEuro />}
            description={t('finance.kpi.totalInterestDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('finance.kpi.maxPrice')}
            color="green"
            value={hasIncome ? formatEuro(result.recommendation.maxAffordablePrice, locale) : noData}
            icon={<IconTickCircle />}
            description={t('finance.kpi.maxPriceDesc')}
          />
        </Col>
      </Row>
    </>
  );
}

ResultSummary.displayName = 'ResultSummary';
