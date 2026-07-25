/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Col, Row, Toast, Tooltip, Typography } from '@douyinfe/semi-ui-19';
import { useNavigate } from 'react-router-dom';
import {
  IconTerminal,
  IconClock,
  IconDoubleChevronLeft,
  IconDoubleChevronRight,
  IconStarStroked,
  IconNoteMoney,
  IconPlayCircle,
  IconPlusCircle,
} from '@douyinfe/semi-icons';

import { useSelector, useActions } from '../../services/state/store';
import KpiCard from '../../components/cards/KpiCard.jsx';
import ProviderShareChart from '../../components/cards/ProviderShareChart.jsx';
import TrendSparkline from '../../components/cards/TrendSparkline.jsx';
import Headline from '../../components/headline/Headline.jsx';

import './Dashboard.less';
import { xhrPost } from '../../services/xhr.js';
import { format } from '../../services/time/timeService.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

const { Text, Title } = Typography;

/**
 * Turn a timestamp into how far away it is, e.g. "in 56 min" or "4 min ago".
 *
 * A job that runs on an interval makes an absolute timestamp work the reader has to do: they
 * have to subtract the current time to learn the only thing they wanted, which is whether it
 * just ran or is about to. The exact stamp stays available in the tooltip.
 *
 * @param {number|null|undefined} timestamp Epoch ms.
 * @param {(key: string, params?: Object) => string} t
 * @param {number} [now]
 * @returns {string|null} `null` when there is nothing to describe.
 */
function relativeTime(timestamp, t, now = Date.now()) {
  if (timestamp == null || timestamp === 0) {
    return null;
  }
  const deltaMinutes = Math.round((timestamp - now) / 60000);
  const magnitude = Math.abs(deltaMinutes);
  if (magnitude < 1) {
    return t('dashboard.timeNow');
  }
  const unit =
    magnitude < 60
      ? { key: 'Minutes', value: magnitude }
      : magnitude < 60 * 24
        ? { key: 'Hours', value: Math.round(magnitude / 60) }
        : { key: 'Days', value: Math.round(magnitude / (60 * 24)) };
  const direction = deltaMinutes > 0 ? 'in' : 'ago';
  return t(`dashboard.time${direction === 'in' ? 'In' : 'Ago'}${unit.key}`, { count: String(unit.value) });
}

export default function Dashboard() {
  const t = useTranslation();
  const locale = useLocale();
  const actions = useActions();
  const navigate = useNavigate();
  const dashboard = useSelector((state) => state.dashboard.data);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    actions.dashboard.getDashboard();
  }, []);

  const kpis = dashboard?.kpis || { totalJobs: 0, totalListings: 0, providersUsed: 0 };
  const trend = dashboard?.trend;
  const providerShare = dashboard?.pie || [];
  const lastRun = dashboard?.general?.lastRun;
  const nextRun = dashboard?.general?.nextRun;

  const runNow = async () => {
    setSearching(true);
    try {
      await xhrPost('/api/jobs/startAll', null);
      Toast.success(t('dashboard.searchNowStarted'));
    } catch {
      Toast.error(t('dashboard.searchNowFailed'));
    } finally {
      setSearching(false);
    }
  };

  /** A timestamp shown as its distance from now, with the exact value one hover away. */
  const timeValue = (timestamp) => {
    const relative = relativeTime(timestamp, t);
    if (relative == null) {
      return '---';
    }
    return (
      <Tooltip content={format(timestamp, true, locale)}>
        <span>{relative}</span>
      </Tooltip>
    );
  };

  // Nothing configured yet: a grid of dashes tells a new user nothing and looks broken. The one
  // thing they need is the way to their first job.
  if (dashboard != null && kpis.totalJobs === 0) {
    return (
      <div className="dashboard">
        <Headline text={t('dashboard.title')} />
        <div className="dashboard__empty">
          <Title heading={4} className="dashboard__empty-title">
            {t('dashboard.emptyTitle')}
          </Title>
          <Text type="tertiary" className="dashboard__empty-body">
            {t('dashboard.emptyBody')}
          </Text>
          <Button theme="solid" type="primary" icon={<IconPlusCircle />} onClick={() => navigate('/jobs/new')}>
            {t('dashboard.emptyAction')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* The search action belongs with the page, not inside a KPI card: the other cards in that
          row report a value, and one of them holding a button broke the pattern. */}
      <Headline
        text={t('dashboard.title')}
        actions={
          <Button icon={<IconPlayCircle />} loading={searching} onClick={runNow} theme="borderless">
            {t('dashboard.searchNowButton')}
          </Button>
        }
      />

      <div className="dashboard__section-label">{t('dashboard.sectionGeneral')}</div>
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.searchInterval')}
            value={`${dashboard?.general?.interval} min`}
            icon={<IconClock />}
            description={t('dashboard.searchIntervalDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.lastSearch')}
            value={timeValue(lastRun)}
            icon={<IconDoubleChevronLeft />}
            description={t('dashboard.lastSearchDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.nextSearch')}
            value={timeValue(nextRun)}
            icon={<IconDoubleChevronRight />}
            description={t('dashboard.nextSearchDesc')}
          />
        </Col>
      </Row>

      <div className="dashboard__section-label">{t('dashboard.sectionOverview')}</div>
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.kpiJobs')}
            color="blue"
            value={!kpis.totalJobs ? '---' : kpis.totalJobs}
            icon={<IconTerminal />}
            description={t('dashboard.kpiJobsDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          {/* One card, not two: the old pair reported the same number twice whenever nothing had
              gone inactive yet, which is the normal case. */}
          <KpiCard
            title={t('dashboard.kpiListings')}
            color="orange"
            value={!kpis.totalListings ? '---' : kpis.totalListings}
            icon={<IconStarStroked />}
            description={t('dashboard.kpiListingsActiveDesc', {
              active: String(kpis.numberOfActiveListings ?? 0),
            })}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.kpiMedianPrice')}
            color="purple"
            value={
              !kpis.medianPriceOfListings
                ? '---'
                : new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency: 'EUR',
                    maximumFractionDigits: 0,
                  }).format(kpis.medianPriceOfListings)
            }
            icon={<IconNoteMoney />}
            description={t('dashboard.kpiMedianPriceDesc')}
          />
        </Col>
      </Row>

      {trend?.perDay?.length > 0 && (
        <>
          <div className="dashboard__section-label">{t('dashboard.sectionTrend')}</div>
          <div className="dashboard__panel">
            <div className="dashboard__trend-header">
              <div>
                <span className="dashboard__trend-value">{trend.thisWeek}</span>
                <Text type="tertiary" size="small">
                  {t('dashboard.trendThisWeek')}
                </Text>
              </div>
              {/* Only stated when there is a previous week to compare against. A jump from zero
                  is not a percentage, and pretending otherwise would read as real growth. */}
              {trend.changePct != null && (
                <span
                  className={`dashboard__trend-change dashboard__trend-change--${trend.changePct < 0 ? 'down' : 'up'}`}
                >
                  {trend.changePct > 0 ? '+' : ''}
                  {trend.changePct} % {t('dashboard.trendVsPreviousWeek')}
                </span>
              )}
            </div>
            <TrendSparkline data={trend.perDay} locale={locale} />
          </div>
        </>
      )}

      <div className="dashboard__section-label">{t('dashboard.sectionProviderInsights')}</div>
      <div className="dashboard__panel">
        <ProviderShareChart data={providerShare} totalListings={kpis.totalListings} />
      </div>
    </div>
  );
}

Dashboard.displayName = 'Dashboard';
