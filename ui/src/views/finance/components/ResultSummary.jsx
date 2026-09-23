/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Col, Row } from '@douyinfe/semi-ui-19';
import { IconTickCircle } from '@douyinfe/semi-icons';
import IconEuro from '../../../components/icons/IconEuro.jsx';

import KpiCard from '../../../components/cards/KpiCard.jsx';
import VerdictBanner from './VerdictBanner.jsx';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

/**
 * The answer, before the charts that justify it.
 *
 * Two figures are the answer: what it costs a month, and how much house that rule allows. The
 * other four - payoff time, debt-free age, Restschuld, total interest - are what back it up, and
 * they are rows rather than cards.
 *
 * Six equally loud tiles in five colours is a grid, not an answer, and four of the six had nothing
 * to show until a loan was entered. The row form below is `financeForm__readout`, which this file
 * already uses in PropertyForm for exactly this kind of figure.
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

  // Formatted rather than `toFixed`, which always writes a full stop: a German reader was told the
  // loan runs "28.4" years while every euro figure beside it used a comma.
  const years = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const payoff =
    primary.payoffMonths == null
      ? t('finance.kpi.never')
      : t('finance.kpi.yearsValue', { years: years.format(primary.payoffMonths / 12) });

  // A KPI computed from nothing is a lie dressed as a figure: "€0 a month" and "0 % of your net
  // income" read as answers, when in fact the question has not been asked yet. Each card says so
  // instead, naming the input it is still waiting for - and the supporting rows below are simply
  // not rendered, because a list of four dashes is not worth the space.
  const noData = t('finance.noData');
  const hasLoan = result.financing.loanAmount > 0;
  const hasIncome = (result.budget?.netIncome ?? 0) > 0;

  const rows = !hasLoan
    ? []
    : [
        { key: 'payoff', label: t('finance.kpi.payoff'), value: payoff },
        { key: 'debtFreeAge', label: t('finance.kpi.debtFreeAge'), value: debtFree || '-' },
        {
          key: 'restschuld',
          label: t('finance.kpi.restschuldShort', { years: String(primary.fixedYears) }),
          value: formatEuro(primary.restschuld, locale),
        },
        {
          key: 'totalInterest',
          label: t('finance.kpi.totalInterest'),
          value: formatEuro(primary.totalInterest, locale),
        },
      ];

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
        <Col xs={24} sm={12}>
          <KpiCard
            title={t('finance.kpi.monthlyRate')}
            color="orange"
            value={hasLoan ? formatEuro(primary.monthlyPayment, locale) : noData}
            icon={<IconEuro />}
            description={t('finance.kpi.monthlyRateDesc', { tilgung: String(primary.tilgung) })}
          />
        </Col>
        <Col xs={24} sm={12}>
          <KpiCard
            title={t('finance.kpi.maxPrice')}
            color="green"
            value={hasIncome ? formatEuro(result.recommendation.maxAffordablePrice, locale) : noData}
            icon={<IconTickCircle />}
            description={t('finance.kpi.maxPriceDesc')}
          />
        </Col>
      </Row>

      {rows.length > 0 && (
        <div className="financeForm__readout resultSummary__rows">
          {rows.map(({ key, label, value }) => (
            <div className="financeForm__readout-row" key={key}>
              <span className="resultSummary__label">{label}</span>
              <span className="financeForm__readout-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

ResultSummary.displayName = 'ResultSummary';
