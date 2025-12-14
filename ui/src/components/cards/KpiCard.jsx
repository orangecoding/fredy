/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */
import React from 'react';

import './DashboardCard.less';

export default function KpiCard({
  title,
  icon,
  value,
  valueFontSize = '1.5rem',
  description,
  color = 'gray',
  children,
}) {
  return (
    <div className={`dashboard-card ${color}`}>
      <div className="dashboard-card__header">
        <div className="dashboard-card__icon">{icon}</div>
        <div className="dashboard-card__title">
          <span>{title}</span>
        </div>
      </div>
      <div className="dashboard-card__content">
        <p className="dashboard-card__value" style={{ fontSize: valueFontSize }}>
          {value}
          {children}
        </p>
        {description && <span className="dashboard-card__desc">{description}</span>}
      </div>
    </div>
  );
}
