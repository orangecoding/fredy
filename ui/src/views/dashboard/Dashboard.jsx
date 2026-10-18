/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Toast, Tooltip, Typography } from '@douyinfe/semi-ui-19';
import { useNavigate } from 'react-router';
import { IconPlusCircle } from '@douyinfe/semi-icons';

import { useSelector, useActions } from '../../services/state/store';
import {
  allJobsNeedingAttention,
  findJobsNeedingAttention,
  countJobsNeedingAttention,
} from '../../services/dashboard/attention.js';
import { IconPlay, IconWarning } from '../../components/icons/StrokeIcons.jsx';
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
import { todayHeadline } from '../../services/dashboard/todayHeadline.js';
import { providerNameMap } from '../../services/jobs/jobSetupLine.js';

const { Text, Title } = Typography;

/**
 * The dashboard: what came in, whether the search is running, and what the searches are doing.
 *
 * Ordered by how often each answer is wanted. The newest listings lead, as photographs, because
 * they are why anyone opens the page; the standing figures follow as one line; the searches and
 * the activity close it. Nothing is boxed except the one thing that wants action, the attention
 * notice, so the page reads as one document instead of a wall of tiles.
 *
 * @returns {React.ReactElement}
 */
export default function Dashboard() {
  const t = useTranslation();
  const locale = useLocale();
  const actions = useActions();
  const navigate = useNavigate();
  const dashboard = useSelector((state) => state.dashboard.data);
  const jobs = useSelector((state) => state.jobsData.jobs);
  const providers = useSelector((state) => state.provider);
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
  // The notice shows the first few; the jobs list marks every one of them.
  const attentionAll = allJobsNeedingAttention(jobs, { lastRun });

  // Provider ids as the listings and jobs store them, mapped to the names the portals go by.
  const providerNames = React.useMemo(() => providerNameMap(providers), [providers]);

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

  // Amber once the run the scheduler promised is in the past: the shape a stopped scheduler takes.
  const stale = nextRun != null && nextRun !== 0 && nextRun < Date.now() - 60 * 1000;

  const status = (
    <span className="dashboard__status">
      <span className={`dashboard__statusDot${stale ? ' dashboard__statusDot--stale' : ''}`} aria-hidden="true" />
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
    </span>
  );

  const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="dashboard">
      <Headline
        overline={today}
        text={todayHeadline(trend, t)}
        subtitle={status}
        actions={
          <>
            {canRunPriceTracker && (
              <Button className="dashboard__action" loading={trackingPrices} onClick={runPriceTracker}>
                {t('dashboard.priceTrackerButton')}
              </Button>
            )}
            {/* The one thing on this page that does something rather than reports something, so it
                is the one thing drawn in red. */}
            <Button
              className="dashboard__action"
              icon={<IconPlay />}
              loading={searching}
              onClick={runNow}
              theme="solid"
              type="primary"
            >
              {t('dashboard.searchNowButton')}
            </Button>
          </>
        }
      />

      {/* Only when there is something to say. A permanent notice reading "all good" is one people
          stop looking at, which defeats the point of having one. */}
      {attention.length > 0 && (
        <div className="dashboard__attention" role="status" aria-label={t('dashboard.sectionAttention')}>
          {attention.map((entry) => (
            <div key={entry.id} className="dashboard__attentionItem">
              <IconWarning className="dashboard__attentionIcon" />
              <span className="dashboard__attentionText">
                {t(`dashboard.attention.${entry.reason}`, { name: entry.name })}
              </span>
              <Button size="small" onClick={() => navigate(`/jobs/edit/${entry.id}`)}>
                {t('dashboard.attentionFix')}
              </Button>
            </div>
          ))}
          {attentionTotal > attention.length && (
            <span className="dashboard__attentionMore">
              {t('dashboard.attentionMore', { count: String(attentionTotal - attention.length) })}
            </span>
          )}
        </div>
      )}

      <LatestListings
        listings={latest}
        locale={locale}
        t={t}
        providerNames={providerNames}
        total={kpis.numberOfActiveListings ?? 0}
        onOpen={(id) => navigate(`/listings/listing/${id}`)}
        onOpenAll={() => navigate('/listings')}
      />

      {/* The standing figures, as one line between two rules. Every one is a way into the thing it
          counts. */}
      <section className="dashboard__kpis" aria-label={t('dashboard.title')}>
        <button type="button" className="dashboard__kpi" onClick={() => navigate('/listings')}>
          <span className="dashboard__kpiLabel">{t('dashboard.kpiListings')}</span>
          <span className="dashboard__kpiValue">
            {!kpis.numberOfActiveListings ? '---' : kpis.numberOfActiveListings}
          </span>
          {/* `numberOfListings`, not `totalListings`: the latter counts the active ones only, and
              "of 42 ever found" under a 42 said nothing. */}
          <span className="dashboard__kpiMeta">
            {t('dashboard.kpiListingsActiveDesc', {
              total: String(kpis.numberOfListings ?? kpis.totalListings ?? 0),
            })}
          </span>
        </button>
        <button type="button" className="dashboard__kpi" onClick={() => navigate('/listings')}>
          <span className="dashboard__kpiLabel">{t('dashboard.kpiNew7')}</span>
          {/* Not the `!value` guard the other figures use: a week that found nothing is a fact about
              the search, and hiding it behind a dash is the failure this figure exists to show. */}
          <span className="dashboard__kpiValue">{trend?.thisWeek ?? '---'}</span>
          <span className="dashboard__kpiMeta">
            {trend?.changePct == null ? (
              t('dashboard.kpiNew7NoCompare')
            ) : (
              // Both directions carry the same weight: green for growth and grey for a collapse
              // would read as "nothing happened" for the one number that should send someone to
              // their job settings.
              <span className={`dashboard__delta dashboard__delta--${trend.changePct < 0 ? 'down' : 'up'}`}>
                {t('dashboard.deltaVsPreviousWeek', {
                  percent: `${trend.changePct < 0 ? '−' : '+'}${Math.abs(trend.changePct)}`,
                })}
              </span>
            )}
          </span>
        </button>
        <button type="button" className="dashboard__kpi" onClick={() => navigate('/listings?sort=price&dir=asc')}>
          <span className="dashboard__kpiLabel">{t('dashboard.kpiMedianPrice')}</span>
          <span className="dashboard__kpiValue">
            {!kpis.medianPriceOfListings
              ? '---'
              : // Rounded before formatting: an even number of listings averages the two middle
                // prices, and half a cent of that arithmetic is not a fact about the market.
                formatEuroPrice(Math.round(kpis.medianPriceOfListings), locale)}
          </span>
          {/* The population the median is taken over. Without it, two medians that cannot be
              reconciled sit next to each other. */}
          {kpis.medianPriceSampleSize > 0 && (
            <span className="dashboard__kpiMeta">
              {t('dashboard.kpiMedianPriceDesc', { count: String(kpis.medianPriceSampleSize) })}
            </span>
          )}
        </button>
        <button type="button" className="dashboard__kpi" onClick={() => navigate('/listings')}>
          <span className="dashboard__kpiLabel">{t('dashboard.kpiMedianSqm')}</span>
          <span className="dashboard__kpiValue">
            {kpis.medianPricePerSqm == null ? '---' : formatPricePerSqm(kpis.medianPricePerSqm.value, locale, false)}
          </span>
          {/* One deal type only, named here: a median over rents and purchase prices at once would
              describe neither. */}
          <span className="dashboard__kpiMeta">
            {kpis.medianPricePerSqm == null
              ? t('dashboard.kpiMedianSqmPending')
              : t(`dashboard.kpiMedianSqmDesc.${kpis.medianPricePerSqm.dealType}`, {
                  count: String(kpis.medianPricePerSqm.sampleSize),
                })}
          </span>
        </button>
      </section>

      <div className="dashboard__columns">
        <JobsPanel
          jobs={jobs}
          jobActivity={jobActivity}
          attention={attentionAll}
          providerNames={providerNames}
          loaded={dashboard != null}
          t={t}
          onCreate={() => navigate('/jobs/new')}
          // A job that is only shared with this user cannot be edited by them (the Jobs page
          // disables Edit for it), so its row leads to the jobs page instead of a form whose save
          // is refused.
          onOpenJob={(job) => navigate(job.isOnlyShared ? '/jobs' : `/jobs/edit/${job.id}`)}
        />
        <div className="dashboard__activity">
          {trend?.perDay?.length > 0 && (
            <section className="dashboard__section" aria-labelledby="dashboard-trend">
              <h2 id="dashboard-trend" className="dashboard__sectionTitle">
                {t('dashboard.sectionTrend')}
              </h2>
              <TrendBars
                data={trend.perDay}
                previousWeek={trend.previousWeek}
                thisWeek={trend.thisWeek}
                locale={locale}
              />
            </section>
          )}
          <section className="dashboard__section" aria-labelledby="dashboard-providers">
            <h2 id="dashboard-providers" className="dashboard__sectionTitle">
              {t('dashboard.sectionProviderInsights')}
            </h2>
            <ProviderShareChart data={providerShare} totalListings={kpis.totalListings} />
          </section>
        </div>
      </div>
    </div>
  );
}

Dashboard.displayName = 'Dashboard';
