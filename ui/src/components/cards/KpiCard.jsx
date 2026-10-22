/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './DashboardCard.less';

/**
 * One figure with its label and a line of context, on a surface with a hairline.
 *
 * Plain on purpose: no icon, no tint, no colour per card. A row of tiles in four colours suggests
 * four categories, and the figure is what the reader came for.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {React.ReactNode} props.value
 * @param {React.ReactNode} [props.description]
 * @param {React.ReactNode} [props.children] Rendered after the value, on the same line.
 * @returns {React.ReactElement}
 */
export default function KpiCard({ title, value, description, children }) {
  return (
    <div className="dashboard-card">
      <span className="dashboard-card__title">{title}</span>
      <span className="dashboard-card__value">
        {value}
        {children}
      </span>
      {description && <span className="dashboard-card__desc">{description}</span>}
    </div>
  );
}

KpiCard.displayName = 'KpiCard';
