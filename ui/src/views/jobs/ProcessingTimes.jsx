import React from 'react';
import { format } from '../../services/time/timeService';
import { Button, Card, Col, Row, Toast } from '@douyinfe/semi-ui';
import {
  IconClock,
  IconDoubleChevronLeft,
  IconDoubleChevronRight,
  IconPlayCircle,
  IconSearch,
} from '@douyinfe/semi-icons';
import { xhrPost } from '../../services/xhr.js';

import './ProsessingTimes.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';

function InfoCard({ title, value, icon }) {
  const { Meta } = Card;
  return (
    <div
      style={{
        margin: '1rem',
        background: 'rgb(53, 54, 60)',
        borderRadius: '.3rem',
        padding: '1rem',
        minHeight: '3rem',
      }}
    >
      <Meta title={title} description={value} avatar={icon} />
    </div>
  );
}

export default function ProcessingTimes({ processingTimes = {} }) {
  if (Object.keys(processingTimes).length === 0) {
    return null;
  }
  const width = useScreenWidth();
  const invisible = width <= 1180;

  if (invisible) {
    return null;
  }

  return (
    <Row>
      <Col span={6}>
        <InfoCard
          title="Search Interval"
          value={`${processingTimes.interval} min`}
          icon={<IconClock style={{ color: 'rgba(var(--semi-grey-4), 1)' }} />}
        />
      </Col>
      {processingTimes.lastRun && (
        <>
          <Col span={6}>
            <InfoCard
              title="Last search"
              icon={<IconDoubleChevronLeft style={{ color: 'rgba(var(--semi-grey-4), 1)' }} />}
              value={format(processingTimes.lastRun)}
            />
          </Col>
          <Col span={6}>
            <InfoCard
              title="Next search"
              icon={<IconDoubleChevronRight style={{ color: 'rgba(var(--semi-grey-4), 1)' }} />}
              value={format(processingTimes.lastRun + processingTimes.interval * 60000)}
            />
          </Col>
        </>
      )}
      <Col span={6}>
        <InfoCard
          title="Search Now"
          icon={<IconSearch style={{ color: 'rgba(var(--semi-grey-4), 1)' }} />}
          value={
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
          }
        />
      </Col>
    </Row>
  );
}
