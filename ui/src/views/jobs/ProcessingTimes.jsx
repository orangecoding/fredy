import React from 'react';
import { format } from '../../services/time/timeService';
import { Button, Card, Col, Row, Toast } from '@douyinfe/semi-ui';
import { IconPlayCircle } from '@douyinfe/semi-icons';
import { xhrPost } from '../../services/xhr.js';

import './ProsessingTimes.less';

function InfoCard({ title, value }) {
  return (
    <Card style={{ maxWidth: '13rem', margin: '1rem', background: 'rgb(53, 54, 60)' }} title={title}>
      {value}
    </Card>
  );
}

export default function ProcessingTimes({ processingTimes = {} }) {
  if (Object.keys(processingTimes).length === 0) {
    return null;
  }
  return (
    <Row>
      <Col span={6}>
        <InfoCard title="Processing Interval" value={`${processingTimes.interval} min`} />
      </Col>
      {processingTimes.lastRun && (
        <>
          <Col span={6}>
            <InfoCard title="Last run" value={format(processingTimes.lastRun)} />
          </Col>
          <Col span={6}>
            <InfoCard title="Next run" value={format(processingTimes.lastRun + processingTimes.interval * 60000)} />
          </Col>
        </>
      )}
      <Col span={6}>
        <InfoCard
          title="Find Listings Now"
          value={
            <Button
              size="small"
              icon={<IconPlayCircle />}
              aria-label="Start now"
              onClick={async () => {
                await xhrPost('/api/jobs/startAll', null);
                Toast.success('Successfully triggered Fredy search.');
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
