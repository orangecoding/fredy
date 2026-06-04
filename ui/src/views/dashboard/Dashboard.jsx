/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Col, Row, Toast } from '@douyinfe/semi-ui-19';
import {
  IconTerminal,
  IconStar,
  IconClock,
  IconDoubleChevronLeft,
  IconDoubleChevronRight,
  IconStarStroked,
  IconNoteMoney,
  IconSearch,
  IconPlayCircle,
} from '@douyinfe/semi-icons';

import { useSelector, useActions } from '../../services/state/store';
import KpiCard from '../../components/cards/KpiCard.jsx';
import PieChartCard from '../../components/cards/PieChartCard.jsx';
import Headline from '../../components/headline/Headline.jsx';

import './Dashboard.less';
import { xhrPost } from '../../services/xhr.js';
import { format } from '../../services/time/timeService.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';

export default function Dashboard() {
  const t = useTranslation();
  const locale = useLocale();
  const actions = useActions();
  const dashboard = useSelector((state) => state.dashboard.data);
  React.useEffect(() => {
    actions.dashboard.getDashboard();
  }, []);

  const kpis = dashboard?.kpis || { totalJobs: 0, totalListings: 0, providersUsed: 0 };
  const pieData = dashboard?.pie || [];

  return (
    <div className="dashboard">
      <Headline text={t('dashboard.title')} />

      <div className="dashboard__section-label">{t('dashboard.sectionGeneral')}</div>
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.searchInterval')}
            value={`${dashboard?.general?.interval} min`}
            icon={<IconClock />}
            description={t('dashboard.searchIntervalDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.lastSearch')}
            value={
              dashboard?.general?.lastRun == null || dashboard?.general?.lastRun === 0
                ? '---'
                : format(dashboard?.general?.lastRun, true, locale)
            }
            icon={<IconDoubleChevronLeft />}
            description={t('dashboard.lastSearchDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.nextSearch')}
            value={
              dashboard?.general?.nextRun == null || dashboard?.general?.nextRun === 0
                ? '---'
                : format(dashboard?.general?.nextRun, true, locale)
            }
            icon={<IconDoubleChevronRight />}
            description={t('dashboard.nextSearchDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard title={t('dashboard.searchNow')} icon={<IconSearch />} description={t('dashboard.searchNowDesc')}>
            <Button
              size="small"
              style={{ marginTop: '.2rem' }}
              icon={<IconPlayCircle />}
              aria-label={t('common.startNow')}
              onClick={async () => {
                try {
                  await xhrPost('/api/jobs/startAll', null);
                  Toast.success(t('dashboard.searchNowStarted'));
                } catch {
                  Toast.error(t('dashboard.searchNowFailed'));
                }
              }}
            >
              {t('dashboard.searchNowButton')}
            </Button>
          </KpiCard>
        </Col>
      </Row>

      <div className="dashboard__section-label">{t('dashboard.sectionOverview')}</div>
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.kpiJobs')}
            color="blue"
            value={!kpis.totalJobs ? '---' : kpis.totalJobs}
            icon={<IconTerminal />}
            description={t('dashboard.kpiJobsDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.kpiListings')}
            color="orange"
            value={!kpis.totalListings ? '---' : kpis.totalListings}
            icon={<IconStarStroked />}
            description={t('dashboard.kpiListingsDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.kpiActiveListings')}
            color="green"
            value={!kpis.numberOfActiveListings ? '---' : kpis.numberOfActiveListings}
            icon={<IconStar />}
            description={t('dashboard.kpiActiveListingsDesc')}
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title={t('dashboard.kpiMedianPrice')}
            color="purple"
            value={`${
              !kpis.medianPriceOfListings
                ? '---'
                : new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(
                    kpis.medianPriceOfListings,
                  )
            }`}
            icon={<IconNoteMoney />}
            description={t('dashboard.kpiMedianPriceDesc')}
          />
        </Col>
      </Row>

      <div className="dashboard__section-label">{t('dashboard.sectionProviderInsights')}</div>
      <div className="dashboard__pie-wrapper">
        <PieChartCard data={pieData} />
      </div>
    </div>
  );
}

Dashboard.displayName = 'Dashboard';
