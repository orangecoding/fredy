/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Col, Row, Toast } from '@douyinfe/semi-ui';
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
import { SegmentPart } from '../../components/segment/SegmentPart.jsx';
import { xhrPost } from '../../services/xhr.js';
import { format } from '../../services/time/timeService.js';

export default function Dashboard() {
  const actions = useActions();
  const dashboard = useSelector((state) => state.dashboard.data);
  React.useEffect(() => {
    actions.dashboard.getDashboard();
  }, []);

  const kpis = dashboard?.kpis || { totalJobs: 0, totalListings: 0, providersUsed: 0 };
  const pieData = dashboard?.pie || [];

  return (
    <div className="dashboard">
      <Headline text="Dashboard" size={3} />

      <Row gutter={16} className="dashboard__row">
        <Col span={12} xs={24} sm={24} md={24} lg={24} xl={12}>
          <SegmentPart name="General" Icon={IconTerminal}>
            <Row gutter={16} className="dashboard__row">
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Search Interval"
                  value={`${dashboard?.general?.interval} min`}
                  icon={<IconClock />}
                  description="Time interval for job execution"
                />
              </Col>
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Last Search"
                  valueFontSize="14px"
                  value={
                    dashboard?.general?.lastRun == null || dashboard?.general?.lastRun === 0
                      ? '---'
                      : format(dashboard?.general?.lastRun)
                  }
                  icon={<IconDoubleChevronLeft />}
                  description="Last execution timestamp"
                />
              </Col>
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Next Search"
                  value={
                    dashboard?.general?.nextRun == null || dashboard?.general?.nextRun === 0
                      ? '---'
                      : format(dashboard?.general?.nextRun)
                  }
                  valueFontSize="14px"
                  icon={<IconDoubleChevronRight />}
                  description="Next execution timestamp"
                />
              </Col>
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard title="Search Now" icon={<IconSearch />} description="Run a search now">
                  <Button
                    size="small"
                    style={{ marginTop: '.2rem' }}
                    icon={<IconPlayCircle />}
                    aria-label="Start now"
                    onClick={async () => {
                      try {
                        await xhrPost('/api/jobs/startAll', null);
                        Toast.success('Successfully triggered Fredy search.');
                      } catch {
                        Toast.error('Failed to trigger search');
                      }
                    }}
                  >
                    Search now
                  </Button>
                </KpiCard>
              </Col>
            </Row>
          </SegmentPart>
        </Col>
        <Col span={12} xs={24} sm={24} md={24} lg={24} xl={12}>
          <SegmentPart name="Overview" Icon={IconStar}>
            <Row gutter={16} className="dashboard__row">
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Jobs"
                  color="blue"
                  value={!kpis.totalJobs ? '---' : kpis.totalJobs}
                  icon={<IconTerminal />}
                  description="Total number of jobs"
                />
              </Col>
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Listings"
                  color="orange"
                  value={!kpis.totalListings ? '---' : kpis.totalListings}
                  icon={<IconStarStroked />}
                  description="Total listings found"
                />
              </Col>
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Active Listings"
                  color="green"
                  value={!kpis.numberOfActiveListings ? '---' : kpis.numberOfActiveListings}
                  icon={<IconStar />}
                  description="Total active listings"
                />
              </Col>
              <Col span={12} xs={24} sm={12} md={12} lg={12} xl={12}>
                <KpiCard
                  title="Avg. Price"
                  color="purple"
                  value={`${!kpis.avgPriceOfListings ? '---' : kpis.avgPriceOfListings} EUR`}
                  icon={<IconNoteMoney />}
                  description="Avg. Price of listings"
                />
              </Col>
            </Row>
          </SegmentPart>
        </Col>
      </Row>

      <SegmentPart name="Provider Insights" Icon={IconStar} helpText="Percentage of found listings over all providers">
        <PieChartCard title="Jobs per Provider" data={pieData} isLoading={false} />
      </SegmentPart>
    </div>
  );
}

Dashboard.displayName = 'Dashboard';
