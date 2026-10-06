/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography, Tag } from '@douyinfe/semi-ui-19';

import './ImmoBotScoreCard.less';

const { Text, Title } = Typography;

/**
 * Colour for a score value: green >= 60, orange >= 40, red < 40.
 *
 * @param {number} score
 * @returns {string}
 */
function scoreColor(score) {
  if (score >= 60) return 'var(--f-success)';
  if (score >= 40) return 'var(--f-warning)';
  return 'var(--f-error)';
}

/**
 * Risk level label from the numeric asset_risk_score.
 *
 * @param {number} risk
 * @returns {{label: string, color: string}}
 */
function riskLevel(risk) {
  if (risk < 5) return { label: 'Low', color: 'var(--f-success)' };
  if (risk < 10) return { label: 'Medium', color: 'var(--f-warning)' };
  return { label: 'High', color: 'var(--f-error)' };
}

/**
 * Compute the cashflow (net yield) sub-score out of 40.
 *
 * @param {number} miete - Mietspiegel in EUR/m².
 * @param {number} area - Living space in m².
 * @param {number} price - Purchase price in EUR.
 * @returns {{score: number, yield: number}}
 */
function computeCashflow(miete, area, price) {
  if (!miete || !area || !price || price === 0) return { score: 0, yield: 0 };
  const annualRent = miete * area * 12 * 0.95;
  const netYield = annualRent / price;
  let score = 0;
  if (netYield >= 0.05) score = 40;
  else if (netYield > 0.015) score = ((netYield - 0.015) / 0.035) * 40;
  return { score, yield: netYield };
}

/**
 * Compute the buy/rent sub-score out of 40.
 *
 * @param {number} miete - Mietspiegel in EUR/m².
 * @param {number} area - Living space in m².
 * @param {number} price - Purchase price in EUR.
 * @returns {{score: number, ratio: number}}
 */
function computeBuyRent(miete, area, price) {
  if (!miete || !area || !price || price === 0) return { score: 0, ratio: 0 };
  const annualRent = miete * 2 * area * 12;
  if (annualRent === 0) return { score: 0, ratio: 0 };
  const ratio = price / annualRent;
  let score = 0;
  if (ratio <= 15) score = 40;
  else if (ratio < 35) score = ((35 - ratio) / 20) * 40;
  return { score, ratio };
}

/**
 * Compute the CAGR sub-score out of 40.
 *
 * @param {number} cagr - Compound annual growth rate as decimal.
 * @returns {{score: number, pct: number}}
 */
function computeCagr(cagr) {
  if (cagr === null || cagr === undefined) return { score: 0, pct: 0 };
  const pct = cagr * 100;
  let score = 0;
  if (cagr >= 0.1) score = 40;
  else if (cagr > 0.02) score = ((cagr - 0.02) / 0.08) * 40;
  return { score, pct };
}

/**
 * Compute the risk sub-score out of 20.
 *
 * @param {number} assetRisk - Asset risk score (0-100).
 * @returns {number}
 */
function computeRisk(assetRisk) {
  if (!assetRisk || assetRisk === 0) return 0;
  if (assetRisk < 5) return 15;
  if (assetRisk < 10) return 10;
  if (assetRisk < 20) return 5;
  return 0;
}

/**
 * Generate a human-readable explanation for the cashflow sub-score.
 *
 * @param {number} yieldPct - Net rental yield as decimal.
 * @param {boolean} hasData - Whether we have the data to compute this.
 * @returns {string}
 */
function cashflowNote(yieldPct, hasData) {
  if (!hasData) return 'Missing Mietspiegel or price data';
  const pct = yieldPct * 100;
  if (pct >= 5) return 'Excellent yield — above 5% threshold';
  if (pct >= 3) return 'Good yield — above Berlin average';
  if (pct >= 2) return 'Below average yield for Berlin';
  return 'Very low yield — below 2%';
}

/**
 * Generate a human-readable explanation for the buy/rent sub-score.
 *
 * @param {number} ratio - Price to annual rent ratio (with 2x Mietspiegel).
 * @param {boolean} hasData - Whether we have the data to compute this.
 * @returns {string}
 */
function buyRentNote(ratio, hasData) {
  if (!hasData) return 'Missing Mietspiegel or price data';
  if (ratio <= 15) return 'Very affordable — price < 15x annual rent';
  if (ratio <= 25) return 'Good value — price < 25x annual rent';
  if (ratio <= 35) return 'Expensive — price > 25x annual rent';
  return 'Very expensive — price > 35x annual rent';
}

/**
 * Generate a human-readable explanation for the CAGR sub-score.
 *
 * @param {number} cagrPct - CAGR as percentage.
 * @param {boolean} hasData - Whether we have CAGR data.
 * @returns {string}
 */
function cagrNote(cagrPct, hasData) {
  if (!hasData) return 'No BRW history available';
  if (cagrPct < 0) return `Declining area — ${cagrPct.toFixed(1)}% per year`;
  if (cagrPct < 2) return 'Weak growth — below 2% per year';
  if (cagrPct < 6) return 'Solid growth — in line with Berlin trend';
  if (cagrPct < 10) return 'Strong growth — above average appreciation';
  return 'Very strong growth — top-tier location';
}

/**
 * Generate a human-readable explanation for the risk sub-score.
 *
 * @param {number} score - Sub-score out of 20.
 * @param {string} riskSummary - Risk summary text from the LLM analysis.
 * @returns {string}
 */
function riskNote(score, riskSummary) {
  if (score === 0) return 'No risk analysis available';
  if (riskSummary) return riskSummary;
  if (score >= 15) return 'Low renovation risk';
  if (score >= 10) return 'Moderate risk factors identified';
  return 'Significant renovation or financial risk';
}

/**
 * A single breakdown row for a scoring component.
 *
 * @param {Object} props
 * @param {string} props.label - Component name.
 * @param {number} props.score - Achieved sub-score.
 * @param {number} props.max - Maximum possible sub-score.
 * @param {string} props.note - Human-readable explanation.
 * @param {string} [props.metric] - Formatted metric value to display.
 * @param {string} [props.metricLabel] - Label for the metric value.
 */
function BreakdownRow({ label, score, max, note, metric, metricLabel }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return (
    <div className="immoBotScore__component">
      <div className="immoBotScore__component-header">
        <Text className="immoBotScore__component-label">{label}</Text>
        <Text className="immoBotScore__component-score" style={{ color: scoreColor((score / max) * 100) }}>
          {score.toFixed(0)}/{max}
        </Text>
      </div>
      <div className="immoBotScore__component-track">
        <div
          className="immoBotScore__component-fill"
          style={{ width: `${pct}%`, backgroundColor: scoreColor((score / max) * 100) }}
        />
      </div>
      <div className="immoBotScore__component-detail">
        {metric !== undefined && metricLabel && (
          <Text type="tertiary" size="small" className="immoBotScore__component-metric">
            {metricLabel}: {metric}
          </Text>
        )}
        <Text type="tertiary" size="small" className="immoBotScore__component-note">
          {note}
        </Text>
      </div>
    </div>
  );
}

/**
 * Immo-Bot scoring card shown in the listing detail view.
 *
 * Displays investor/owner scores with a unified breakdown, BRW data, CAGR, bezirk,
 * and risk summary. Follows the ListingFinanceCard layout pattern.
 *
 * @param {Object} props
 * @param {Object} props.listing - The listing object from Fredy's API.
 */
export default function ImmoBotScoreCard({ listing }) {
  if (!listing) return null;

  const investorScore = listing.investor_score ?? 0;
  const ownerScore = listing.owner_score ?? 0;
  const assetRisk = listing.asset_risk_score ?? 0;
  const brwValue = listing.brw_value ?? 0;
  const brwOld = listing.brw_old ?? 0;
  const cagr = listing.cagr ?? null;
  const bezirk = listing.bezirk ?? '';
  const riskSummary = listing.risk_summary ?? '';
  const miete = listing.isochronen_miete ?? 0;
  const price = listing.price ?? 0;
  const area = listing.size ?? 0;

  // The block always renders: hiding it when nothing is scored yet made a stalled backend
  // look like a deleted feature. Unscored listings show zeros with the reason instead.
  const scored = !(investorScore === 0 && ownerScore === 0 && brwValue === 0);

  const risk = riskLevel(assetRisk);
  const cagrData = computeCagr(cagr);
  const cashflowData = computeCashflow(miete, area, price);
  const buyRentData = computeBuyRent(miete, area, price);
  const riskPts = computeRisk(assetRisk);

  const hasMiete = miete > 0 && area > 0 && price > 0;
  const cagrPctStr = cagr !== null ? `${cagrData.pct.toFixed(1)}%` : 'N/A';
  const brwChange = brwOld > 0 ? (((brwValue - brwOld) / brwOld) * 100).toFixed(1) : null;

  return (
    <section className="immoBotScore">
      <div className="immoBotScore__header">
        <Title heading={4} className="immoBotScore__title">
          Immo-Bot Scoring
        </Title>
      </div>

      {!scored && (
        <Text type="tertiary" size="small" className="immoBotScore__pending">
          Not scored yet — the scoring backend hasn&apos;t enriched this listing. Check back after the next run.
        </Text>
      )}

      <div className="immoBotScore__bars">
        <div className="immoBotScore__bar-row">
          <Text className="immoBotScore__bar-label">Investor</Text>
          <div className="immoBotScore__bar-track">
            <div
              className="immoBotScore__bar-fill"
              style={{ width: `${Math.min(100, investorScore)}%`, backgroundColor: scoreColor(investorScore) }}
            />
          </div>
          <Text className="immoBotScore__bar-value">{investorScore.toFixed(0)}</Text>
        </div>
        <div className="immoBotScore__bar-row">
          <Text className="immoBotScore__bar-label">Owner</Text>
          <div className="immoBotScore__bar-track">
            <div
              className="immoBotScore__bar-fill"
              style={{ width: `${Math.min(100, ownerScore)}%`, backgroundColor: scoreColor(ownerScore) }}
            />
          </div>
          <Text className="immoBotScore__bar-value">{ownerScore.toFixed(0)}</Text>
        </div>
      </div>

      <div className="immoBotScore__breakdown">
        <Text strong size="small" className="immoBotScore__breakdown-title">
          Score breakdown
        </Text>

        <div className="immoBotScore__breakdown-section">
          <BreakdownRow
            label="Cashflow (Investor)"
            score={cashflowData.score}
            max={40}
            note={cashflowNote(cashflowData.yield, hasMiete)}
            metric={hasMiete ? `${(cashflowData.yield * 100).toFixed(1)}%` : undefined}
            metricLabel={hasMiete ? 'Net yield' : undefined}
          />
          <BreakdownRow
            label="Buy vs. Rent (Owner)"
            score={buyRentData.score}
            max={40}
            note={buyRentNote(buyRentData.ratio, hasMiete)}
            metric={hasMiete ? `${buyRentData.ratio.toFixed(1)}x` : undefined}
            metricLabel={hasMiete ? 'Price / Annual rent' : undefined}
          />
          <BreakdownRow
            label="Kapitalzuwachs"
            score={cagrData.score}
            max={40}
            note={cagrNote(cagrData.pct, cagr !== null)}
            metric={cagrPctStr}
            metricLabel="CAGR (05-26)"
          />
          <BreakdownRow label="Asset-Risiko" score={riskPts} max={20} note={riskNote(riskPts, riskSummary)} />
        </div>
      </div>

      <dl className="immoBotScore__facts">
        {brwValue > 0 && (
          <div className="immoBotScore__fact">
            <dt className="immoBotScore__fact-label">BRW aktuell</dt>
            <dd className="immoBotScore__fact-value">{brwValue.toLocaleString('de-DE')} €/m²</dd>
            {brwChange != null && (
              <dd className="immoBotScore__fact-note">
                {Number(brwChange) >= 0 ? '+' : ''}
                {brwChange}% vs. Vorjahr
              </dd>
            )}
          </div>
        )}

        {bezirk && (
          <div className="immoBotScore__fact">
            <dt className="immoBotScore__fact-label">Bezirk</dt>
            <dd className="immoBotScore__fact-value">{bezirk}</dd>
          </div>
        )}

        <div className="immoBotScore__fact">
          <dt className="immoBotScore__fact-label">Risk</dt>
          <dd className="immoBotScore__fact-value">
            <Tag
              style={{
                color: risk.color,
                backgroundColor: `color-mix(in srgb, ${risk.color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${risk.color} 40%, transparent)`,
              }}
            >
              {risk.label}
            </Tag>
          </dd>
        </div>
      </dl>
    </section>
  );
}

ImmoBotScoreCard.displayName = 'ImmoBotScoreCard';
