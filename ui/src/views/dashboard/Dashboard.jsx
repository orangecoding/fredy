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
  IconStarStroked,
  IconPlayCircle,
  IconPlusCircle,
  IconAlertTriangle,
} from '@douyinfe/semi-icons';

import { useSelector, useActions } from '../../services/state/store';
import { findJobsNeedingAttention, countJobsNeedingAttention } from '../../services/dashboard/attention.js';
// Semi's IconNoteMoney draws a yen note. Fredy quotes euros everywhere, so it gets a euro.
import IconEuro from '../../components/icons/IconEuro.jsx';
import KpiCard from '../../components/cards/KpiCard.jsx';
import ProviderShareChart from '../../components/cards/ProviderShareChart.jsx';
import TrendSparkline from '../../components/cards/TrendSparkline.jsx';
import Headline from '../../components/headline/Headline.jsx';

import './Dashboard.less';
import { xhrPost, errorMessage } from '../../services/xhr.js';
import { formatEuroPrice } from '../../services/price/priceService.js';
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
  const jobs = useSelector((state) => state.jobsData.jobs);
  const currentUser = useSelector((state) => state.user.currentUser);
  const generalSettings = useSelector((state) => state.generalSettings.settings);
  const [searching, setSearching] = React.useState(false);
  const [trackingPrices, setTrackingPrices] = React.useState(false);

  // Admin-only, and only worth offering when the feature is switched on: the sweep touches every
  // tracked listing on the instance, so it is the same audience that configures it. Non-admins are
  // not served `priceTrackingEnabled` at all, which is why both halves of this are needed.
  const canRunPriceTracker = currentUser?.isAdmin === true && generalSettings?.priceTrackingEnabled === true;

  React.useEffect(() => {
    actions.dashboard.getDashboard();
  }, []);

  const kpis = dashboard?.kpis || { totalJobs: 0, totalListings: 0, providersUsed: 0 };
  const trend = dashboard?.trend;
  const providerShare = dashboard?.pie || [];
  const lastRun = dashboard?.general?.lastRun;
  const nextRun = dashboard?.general?.nextRun;

  // Read off the jobs the app has already loaded, so this costs no request of its own.
  const attention = findJobsNeedingAttention(jobs, { lastRun });
  const attentionTotal = countJobsNeedingAttention(jobs, { lastRun });

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

  const runPriceTracker = async () => {
    setTrackingPrices(true);
    try {
      await xhrPost('/api/admin/price-tracking/run', null);
      Toast.success(t('dashboard.priceTrackerStarted'));
    } catch (error) {
      // The backend says why - the feature is off, or a sweep is already going - and that is more
      // useful than a generic failure.
      Toast.error(errorMessage(error, t('dashboard.priceTrackerFailed')));
    } finally {
      setTrackingPrices(false);
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
          <div className="dashboard__actions">
            <Button icon={<IconPlayCircle />} loading={searching} onClick={runNow} theme="borderless">
              {t('dashboard.searchNowButton')}
            </Button>
            {canRunPriceTracker && (
              <>
                <span className="dashboard__actions-divider" aria-hidden="true" />
                <Button icon={<IconEuro />} loading={trackingPrices} onClick={runPriceTracker} theme="borderless">
                  {t('dashboard.priceTrackerButton')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Interval, last run and next run were three KPI cards. They are one line: nobody compares
          them to each other, they are read as a single "is it running" glance, and as cards they
          pushed the numbers people actually came for below the fold. */}
      <div className="dashboard__status">
        <IconClock className="dashboard__status-icon" />
        <span>
          {t('dashboard.statusInterval', { minutes: String(dashboard?.general?.interval ?? '?') })}
          {lastRun != null && lastRun !== 0 && (
            <>
              {' · '}
              {t('dashboard.statusLast')} {timeValue(lastRun)}
            </>
          )}
          {nextRun != null && nextRun !== 0 && (
            <>
              {' · '}
              {t('dashboard.statusNext')} {timeValue(nextRun)}
            </>
          )}
        </span>
      </div>

      {/* Every card here is a way into the thing it counts. They reported numbers and went
          nowhere, which made the dashboard somewhere you pass through rather than start from. */}
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.kpiJobs')}
            color="blue"
            value={!kpis.totalJobs ? '---' : kpis.totalJobs}
            icon={<IconTerminal />}
            description={t('dashboard.kpiJobsDesc')}
            onClick={() => navigate('/jobs')}
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
            onClick={() => navigate('/listings')}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={8} xl={8}>
          <KpiCard
            title={t('dashboard.kpiMedianPrice')}
            color="purple"
            value={
              !kpis.medianPriceOfListings
                ? '---'
                : // Rounded before formatting: an even number of listings averages the two middle
                  // prices, and half a cent of that arithmetic is not a fact about the market.
                  formatEuroPrice(Math.round(kpis.medianPriceOfListings), locale)
            }
            icon={<IconEuro />}
            description={t('dashboard.kpiMedianPriceDesc')}
            onClick={() => navigate('/listings?sort=price&dir=asc')}
          />
        </Col>
      </Row>

      {/* Only when there is something to say. A permanent panel reading "all good" is a panel
          people stop looking at, which defeats the point of having one. */}
      {attention.length > 0 && (
        <>
          <div className="dashboard__section-label">{t('dashboard.sectionAttention')}</div>
          <div className="dashboard__panel dashboard__attention">
            <ul className="dashboard__attention-list">
              {attention.map((entry) => (
                <li key={entry.id} className="dashboard__attention-item">
                  <IconAlertTriangle className="dashboard__attention-icon" />
                  <span className="dashboard__attention-text">
                    {t(`dashboard.attention.${entry.reason}`, { name: entry.name })}
                  </span>
                  <Button size="small" theme="borderless" onClick={() => navigate(`/jobs/edit/${entry.id}`)}>
                    {t('dashboard.attentionFix')}
                  </Button>
                </li>
              ))}
            </ul>
            {attentionTotal > attention.length && (
              <Text type="tertiary" size="small">
                {t('dashboard.attentionMore', { count: String(attentionTotal - attention.length) })}
              </Text>
            )}
          </div>
        </>
      )}

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
