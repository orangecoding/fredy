/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';

import { isScoredListing, isRiskAssessed, riskPoints } from '../../services/scores/scoreState.js';
import './FredyScoreCard.less';

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
 * @param {string} region - GREIX region the listing matched (may be empty).
 * @returns {string}
 */
function cagrNote(cagrPct, hasData, region) {
  const where = region ? ` in ${region.replace(/^Berlin \(|\)$/g, '')}` : '';
  if (!hasData) return 'No GREIX price history for this location';
  if (cagrPct < 0) return `Declining area${where} — ${cagrPct.toFixed(1)}% per year`;
  if (cagrPct < 2) return `Weak growth${where} — below 2% per year`;
  if (cagrPct < 6) return `Solid growth${where} — in line with Berlin trend`;
  if (cagrPct < 10) return `Strong growth${where} — above average appreciation`;
  return `Very strong growth${where} — top-tier location`;
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
 * @param {number|null|undefined} props.score - Achieved sub-score; null renders a grey dash.
 * @param {number} props.max - Maximum possible sub-score.
 * @param {string} props.note - Human-readable explanation.
 * @param {string} [props.metric] - Formatted metric value to display.
 * @param {string} [props.metricLabel] - Label for the metric value.
 */
function BreakdownRow({ label, score, max, note, metric, metricLabel }) {
  // A leg without data is a grey dash, never a red zero: red is a genuine verdict.
  const assessed = score != null;
  const normalized = assessed && max > 0 ? (score / max) * 100 : 0;
  const tone = assessed ? scoreColor(normalized) : 'var(--f-secondary)';
  return (
    <div className="fredyScore__component">
      <div className="fredyScore__component-header">
        <Text className="fredyScore__component-label">{label}</Text>
        <Text className="fredyScore__component-score" style={{ color: tone }}>
          {assessed ? `${score.toFixed(0)}/${max}` : `–/${max}`}
        </Text>
      </div>
      <div className="fredyScore__component-track">
        <div className="fredyScore__component-fill" style={{ width: `${normalized}%`, backgroundColor: tone }} />
      </div>
      <div className="fredyScore__component-detail">
        {metric !== undefined && metricLabel && (
          <Text type="tertiary" size="small" className="fredyScore__component-metric">
            {metricLabel}: {metric}
          </Text>
        )}
        <Text type="tertiary" size="small" className="fredyScore__component-note">
          {note}
        </Text>
      </div>
    </div>
  );
}

/**
 * Fredy scoring card shown in the listing detail view.
 *
 * Displays investor/owner scores with a unified breakdown, GREIX growth data and risk
 * summary. Follows the ListingFinanceCard layout pattern.
 *
 * @param {Object} props
 * @param {Object} props.listing - The listing object from Fredy's API.
 */
export default function FredyScoreCard({ listing }) {
  if (!listing) return null;

  const investorScore = listing.investor_score ?? 0;
  const ownerScore = listing.owner_score ?? 0;
  const assetRisk = listing.asset_risk_score ?? 0;
  const cagr = listing.greix_cagr ?? null;
  const greixRegion = listing.greix_region ?? '';
  const riskSummary = listing.risk_summary ?? '';
  const miete = listing.isochronen_miete ?? 0;
  const price = listing.price ?? 0;
  const area = listing.size ?? 0;

  // The block always renders: hiding it when nothing is scored yet made a stalled backend
  // look like a deleted feature. Unscored listings show grey dashes with the reason instead -
  // red is a genuine verdict, and a score that was never computed is not one.
  // A genuine zero is a verdict, not a missing score: an overpriced flat scores 0 on every
  // axis. Only no-price listings can never score (yield and buy/rent divide by price), and
  // only rows with neither scores nor GREIX growth are still waiting for enrichment.
  const hasPrice = price > 0;
  const scored = isScoredListing(listing);

  const cagrData = computeCagr(cagr);
  const cashflowData = computeCashflow(miete, area, price);
  const buyRentData = computeBuyRent(miete, area, price);
  const riskAssessed = isRiskAssessed(listing);
  const riskPts = riskAssessed ? riskPoints(assetRisk) : null;

  const hasMiete = miete > 0 && area > 0 && price > 0;
  const cagrPctStr = cagr !== null ? `${cagrData.pct.toFixed(1)}%` : 'N/A';

  return (
    <section className="fredyScore">
      <div className="fredyScore__header">
        <Title heading={4} className="fredyScore__title">
          Fredy Scoring
        </Title>
      </div>

      {!scored && (
        <Text type="tertiary" size="small" className="fredyScore__pending">
          {!hasPrice
            ? 'No score — this listing has no asking price, and scoring divides by price.'
            : 'Not scored yet — the hourly enrichment hasn\u2019t scored this listing. Check back after the next run.'}
        </Text>
      )}

      <div className="fredyScore__bars">
        <div className="fredyScore__bar-row">
          <Text className="fredyScore__bar-label">Investor</Text>
          <div className="fredyScore__bar-track">
            <div
              className="fredyScore__bar-fill"
              style={{
                width: `${scored ? Math.min(100, investorScore) : 0}%`,
                backgroundColor: scored ? scoreColor(investorScore) : 'var(--f-secondary)',
              }}
            />
          </div>
          <Text
            className="fredyScore__bar-value"
            style={scored ? { color: scoreColor(investorScore) } : { color: 'var(--f-secondary)' }}
          >
            {scored ? investorScore.toFixed(0) : '–'}
          </Text>
        </div>
        <div className="fredyScore__bar-row">
          <Text className="fredyScore__bar-label">Owner</Text>
          <div className="fredyScore__bar-track">
            <div
              className="fredyScore__bar-fill"
              style={{
                width: `${scored ? Math.min(100, ownerScore) : 0}%`,
                backgroundColor: scored ? scoreColor(ownerScore) : 'var(--f-secondary)',
              }}
            />
          </div>
          <Text
            className="fredyScore__bar-value"
            style={scored ? { color: scoreColor(ownerScore) } : { color: 'var(--f-secondary)' }}
          >
            {scored ? ownerScore.toFixed(0) : '–'}
          </Text>
        </div>
      </div>

      <div className="fredyScore__breakdown">
        <Text strong size="small" className="fredyScore__breakdown-title">
          Score breakdown
        </Text>

        <div className="fredyScore__breakdown-section">
          <BreakdownRow
            label="Cashflow (Investor)"
            score={hasMiete ? cashflowData.score : null}
            max={40}
            note={cashflowNote(cashflowData.yield, hasMiete)}
            metric={hasMiete ? `${(cashflowData.yield * 100).toFixed(1)}%` : undefined}
            metricLabel={hasMiete ? 'Net yield' : undefined}
          />
          <BreakdownRow
            label="Buy vs. Rent (Owner)"
            score={hasMiete ? buyRentData.score : null}
            max={40}
            note={buyRentNote(buyRentData.ratio, hasMiete)}
            metric={hasMiete ? `${buyRentData.ratio.toFixed(1)}x` : undefined}
            metricLabel={hasMiete ? 'Price / Annual rent' : undefined}
          />
          <BreakdownRow
            label="Capital Growth"
            score={cagr !== null ? cagrData.score : null}
            max={40}
            note={cagrNote(cagrData.pct, cagr !== null, greixRegion)}
            metric={cagr !== null ? cagrPctStr : undefined}
            metricLabel={cagr !== null ? 'GREIX CAGR 2000–2025' : undefined}
          />
          <BreakdownRow label="Asset Risk" score={riskPts} max={20} note={riskNote(riskPts ?? 0, riskSummary)} />
        </div>
      </div>
    </section>
  );
}

FredyScoreCard.displayName = 'FredyScoreCard';
