/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * One colored score value for the overview chips and the table chip.
 *
 * Grey dash means "never computed", color means a genuine verdict - the caller decides
 * which via `assessed` (row-level: see `isScoredListing` / `isRiskAssessed`). The score
 * columns default to 0, so the component cannot tell those apart from the value alone.
 *
 * `max` normalizes the green/orange thresholds across scales: investor/owner points
 * run 0-100, risk points 0-20, but green always starts at 60% of the scale.
 */

const SCALE_GREEN = 60;
const SCALE_ORANGE = 40;

/**
 * Tone for a score value: secondary when unassessed, else green/orange/red.
 *
 * @param {number|null|undefined} value Score value (already in display scale).
 * @param {boolean} assessed Whether the value was actually computed.
 * @param {number} [max=100] Top of the value's scale.
 * @returns {string} CSS color variable.
 */
export function scoreColorFor(value, assessed, max = 100) {
  if (!assessed || value == null) return 'var(--f-secondary)';
  const normalized = max > 0 ? (value / max) * 100 : 0;
  if (normalized >= SCALE_GREEN) return 'var(--f-success)';
  if (normalized >= SCALE_ORANGE) return 'var(--f-warning)';
  return 'var(--f-error)';
}

/**
 * @param {Object} props
 * @param {number|null|undefined} props.value Score value in display scale.
 * @param {boolean} props.assessed Whether the value was actually computed.
 * @param {number} [props.max=100] Top of the value's scale.
 */
export default function ScoreChip({ value, assessed, max = 100 }) {
  const text = !assessed || value == null ? '–' : value.toFixed(0);
  return <strong style={{ color: scoreColorFor(value, assessed, max) }}>{text}</strong>;
}
