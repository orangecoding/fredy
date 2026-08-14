/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Card, Typography, Space } from '@douyinfe/semi-ui-19';
import { IconChevronRight } from '@douyinfe/semi-icons';
import './DashboardCard.less';

/**
 * One number on the dashboard.
 *
 * With `onClick` the card becomes the way into whatever it counts, and says so with a chevron and
 * a hover state rather than leaving it to be discovered. A card that reports "312 listings" and
 * cannot be clicked makes the dashboard a place you read and then navigate away from by hand.
 *
 * It renders as a real `<button>` in that case, not a div with a handler, so it is reachable by
 * keyboard and announced as something that does anything at all.
 *
 * @param {Object} props
 * @param {string} props.title
 * @param {React.ReactNode} [props.icon]
 * @param {React.ReactNode} props.value
 * @param {string} [props.description]
 * @param {string} [props.color]
 * @param {() => void} [props.onClick] Makes the card a link to what it counts.
 * @param {React.ReactNode} [props.children]
 * @returns {React.ReactElement}
 */
export default function KpiCard({ title, icon, value, description, color = 'gray', onClick = null, children }) {
  const { Text } = Typography;
  const clickable = onClick != null;

  const body = (
    <Space vertical align="start" spacing="tight" style={{ width: '100%' }}>
      <Space>
        <div className="dashboard-card__icon">{icon}</div>
        <Text strong className="dashboard-card__title">
          {title}
        </Text>
        {clickable && <IconChevronRight className="dashboard-card__chevron" />}
      </Space>
      <div className="dashboard-card__content">
        <div className="dashboard-card__value">
          {value}
          {children}
        </div>
        {description && (
          <Text size="small" className="dashboard-card__desc">
            {description}
          </Text>
        )}
      </div>
    </Space>
  );

  return (
    <Card
      className={`dashboard-card ${color}${clickable ? ' dashboard-card--clickable' : ''}`}
      bodyStyle={{ padding: '16px' }}
    >
      {clickable ? (
        <button type="button" className="dashboard-card__button" onClick={onClick}>
          {body}
        </button>
      ) : (
        body
      )}
    </Card>
  );
}
