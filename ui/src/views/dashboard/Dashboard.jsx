/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Toast, Tooltip, Typography } from '@douyinfe/semi-ui-19';
import { useNavigate } from 'react-router';
import {
  IconClock,
  IconStarStroked,
  IconPlayCircle,
  IconPlusCircle,
  IconAlertTriangle,
  IconExpand,
  IconArrowUp,
  IconArrowDown,
  IconArrowUpRight,
} from '@douyinfe/semi-icons';

import { useSelector, useActions } from '../../services/state/store';
import {
  allJobsNeedingAttention,
  findJobsNeedingAttention,
  countJobsNeedingAttention,
} from '../../services/dashboard/attention.js';
// Semi's IconNoteMoney draws a yen note. Fredy quotes euros everywhere, so it gets a euro.
import IconEuro from '../../components/icons/IconEuro.jsx';
import KpiCard from '../../components/cards/KpiCard.jsx';
import ProviderShareChart from '../../components/cards/ProviderShareChart.jsx';
import TrendBars from './components/TrendBars.jsx';
import LatestListings from './components/LatestListings.jsx';
import JobsPanel from './components/JobsPanel.jsx';
import Headline from '../../components/headline/Headline.jsx';

import './Dashboard.less';
import { xhrPost, errorMessage } from '../../services/xhr.js';
import { formatEuroPrice } from '../../services/price/priceService.js';
import { formatPricePerSqm } from '../../services/listings/marketBenchmark.js';
import { format } from '../../services/time/timeService.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { relativeTime } from '../../services/time/relativeTime.js';

const { Text, Title } = Typography;

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
    // The jobs panel and the attention list read the job list, which App loads once at start-up.
    // Without a reload here each row's "last run" is as old as the tab.
    actions.jobsData.getJobs();
  }, []);

  const kpis = dashboard?.kpis || { totalJobs: 0, totalListings: 0, providersUsed: 0 };
  const trend = dashboard?.trend;
  const providerShare = dashboard?.pie || [];
  const latest = dashboard?.latest || [];
  const jobActivity = dashboard?.jobActivity || {};
  const lastRun = dashboard?.general?.lastRun;
  const nextRun = dashboard?.general?.nextRun;

  // Read off the jobs the app has already loaded, so this costs no request of its own.
  const attention = findJobsNeedingAttention(jobs, { lastRun });
  const attentionTotal = countJobsNeedingAttention(jobs, { lastRun });
  // The attention card shows the first few; the jobs panel marks every one of them.
  const attentionAll = allJobsNeedingAttention(jobs, { lastRun });

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
            {/* The one thing on this page that does something rather than reports something, so it
                is the one thing drawn as a button. Solid primary puts it in the same family as the
                empty state's "create your first job", which is the same kind of act. */}
            <Button icon={<IconPlayCircle />} loading={searching} onClick={runNow} theme="solid" type="primary">
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
          nowhere, which made the dashboard somewhere you pass through rather than start from.
          All four are plain: four colours across the most important row of the page suggested
          four categories, and there are none. */}
      <div className="dashboard__kpis">
        {/* One card, not two: the old pair reported the same number twice whenever nothing had
            gone inactive yet, which is the normal case. */}
        <KpiCard
          title={t('dashboard.kpiListings')}
          color="plain"
          value={!kpis.numberOfActiveListings ? '---' : kpis.numberOfActiveListings}
          icon={<IconStarStroked />}
          // `numberOfListings`, not `totalListings`: the latter counts the active ones only, and
          // "of 42 ever found" under a 42 said nothing.
          description={t('dashboard.kpiListingsActiveDesc', {
            total: String(kpis.numberOfListings ?? kpis.totalListings ?? 0),
          })}
          onClick={() => navigate('/listings')}
        />
        {/* This replaced a card reading "Jobs 2". A standing count of searches is the one thing
            the reader already knows; what came in this week is not. */}
        <KpiCard
          title={t('dashboard.kpiNew7')}
          color="plain"
          // Not the `!value` guard the other cards use: a week that found nothing is a fact about
          // the search, and hiding it behind a dash is the failure this card exists to show.
          value={trend?.thisWeek ?? '---'}
          icon={<IconArrowUpRight />}
          description={
            trend?.changePct == null ? (
              t('dashboard.kpiNew7NoCompare')
            ) : (
              <span className={`dashboard__delta dashboard__delta--${trend.changePct < 0 ? 'down' : 'up'}`}>
                {trend.changePct < 0 ? <IconArrowDown /> : <IconArrowUp />}
                {t('dashboard.deltaVsPreviousWeek', { percent: String(Math.abs(trend.changePct)) })}
              </span>
            )
          }
          onClick={() => navigate('/listings')}
        />
        <KpiCard
          title={t('dashboard.kpiMedianPrice')}
          color="plain"
          value={
            !kpis.medianPriceOfListings
              ? '---'
              : // Rounded before formatting: an even number of listings averages the two middle
                // prices, and half a cent of that arithmetic is not a fact about the market.
                formatEuroPrice(Math.round(kpis.medianPriceOfListings), locale)
          }
          icon={<IconEuro />}
          // Both medians are taken over every listing that was ever found, active or not, while
          // the first card counts only the active ones. Without the population named, two numbers
          // that cannot be reconciled sit next to each other.
          // The priced listings the median is taken over. Not the m² card's sample, which covers one
          // deal type and only listings that state a size.
          description={
            kpis.medianPriceSampleSize > 0
              ? t('dashboard.kpiMedianPriceDesc', { count: String(kpis.medianPriceSampleSize) })
              : null
          }
          onClick={() => navigate('/listings?sort=price&dir=asc')}
        />
        {/* The median price next door answers "what do flats cost here", which is a different
            question from "what does a square metre cost here" - the first moves with how big
            the flats a search happens to turn up are, the second does not.
            One deal type only, named in the description: a median taken over rents and purchase
            prices at once would describe neither. */}
        <KpiCard
          title={t('dashboard.kpiMedianSqm')}
          color="plain"
          value={kpis.medianPricePerSqm == null ? '---' : formatPricePerSqm(kpis.medianPricePerSqm.value, locale)}
          icon={<IconExpand />}
          description={
            kpis.medianPricePerSqm == null
              ? t('dashboard.kpiMedianSqmPending')
              : t(`dashboard.kpiMedianSqmDesc.${kpis.medianPricePerSqm.dealType}`, {
                  count: String(kpis.medianPricePerSqm.sampleSize),
                })
          }
          onClick={() => navigate('/listings')}
        />
      </div>

      {/* Only when there is something to say. A permanent panel reading "all good" is a panel
          people stop looking at, which defeats the point of having one. */}
      {attention.length > 0 && (
        <div className="dashboard__card dashboard__attention">
          <div className="dashboard__cardHead">
            <h2 className="dashboard__cardLabel">{t('dashboard.sectionAttention')}</h2>
          </div>
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
      )}

      {/* What came in on the left, the three things that describe the searches on the right. The
          bottom half of this page used to be empty. */}
      <div className="dashboard__grid">
        <div className="dashboard__main">
          <LatestListings
            listings={latest}
            locale={locale}
            t={t}
            total={kpis.numberOfActiveListings ?? 0}
            onOpen={(id) => navigate(`/listings/listing/${id}`)}
            onOpenAll={() => navigate('/listings')}
          />
        </div>
        <div className="dashboard__rail">
          {trend?.perDay?.length > 0 && (
            <div className="dashboard__card">
              <div className="dashboard__cardHead">
                <h2 className="dashboard__cardLabel">{t('dashboard.sectionTrend')}</h2>
              </div>
              <TrendBars
                data={trend.perDay}
                previousWeek={trend.previousWeek}
                thisWeek={trend.thisWeek}
                locale={locale}
              />
            </div>
          )}
          <JobsPanel
            jobs={jobs}
            jobActivity={jobActivity}
            attention={attentionAll}
            loaded={dashboard != null}
            t={t}
            onManage={() => navigate('/jobs')}
            // A job that is only shared with this user cannot be edited by them (the Jobs page
            // disables Edit for it), so its row leads to the jobs page instead of a form whose save
            // is refused.
            onOpenJob={(job) => navigate(job.isOnlyShared ? '/jobs' : `/jobs/edit/${job.id}`)}
          />
          <div className="dashboard__card">
            <div className="dashboard__cardHead">
              <h2 className="dashboard__cardLabel">{t('dashboard.sectionProviderInsights')}</h2>
            </div>
            <ProviderShareChart data={providerShare} totalListings={kpis.totalListings} />
          </div>
        </div>
      </div>
    </div>
  );
}

Dashboard.displayName = 'Dashboard';
