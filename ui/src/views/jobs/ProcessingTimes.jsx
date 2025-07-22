import React from 'react';
import { format } from '../../services/time/timeService';
import { Descriptions } from '@douyinfe/semi-ui';

export default function ProcessingTimes({ processingTimes = {} }) {
  if (Object.keys(processingTimes).length === 0) {
    return null;
  }
  return (
    <>
      <Descriptions
        row
        size="small"
        style={{
          backgroundColor: '#35363c',
          borderRadius: '4px',
          padding: '10px',
        }}
      >
        <Descriptions.Item itemKey="Processing Interval">{processingTimes.interval} min</Descriptions.Item>
        {processingTimes.lastRun && (
          <>
            <Descriptions.Item itemKey="Last run">{format(processingTimes.lastRun)}</Descriptions.Item>
            <Descriptions.Item itemKey="Next run">
              {format(processingTimes.lastRun + processingTimes.interval * 60000)}
            </Descriptions.Item>
          </>
        )}
      </Descriptions>
    </>
  );
}
