/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Card, Typography, Space } from '@douyinfe/semi-ui-19';
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
  const { Text } = Typography;
  return (
    <Card className={`dashboard-card ${color}`} bodyStyle={{ padding: '16px' }}>
      <Space vertical align="start" spacing="tight" style={{ width: '100%' }}>
        <Space>
          <div className="dashboard-card__icon">{icon}</div>
          <Text strong className="dashboard-card__title">
            {title}
          </Text>
        </Space>
        <div className="dashboard-card__content">
          <div className="dashboard-card__value" style={{ fontSize: valueFontSize }}>
            {value}
            {children}
          </div>
          {description && (
            <Text size="small" type="tertiary" className="dashboard-card__desc">
              {description}
            </Text>
          )}
        </div>
      </Space>
    </Card>
  );
}
