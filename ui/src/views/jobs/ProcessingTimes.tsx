import React from 'react';
import { format } from '#ui_services/time/timeService';
import { Descriptions } from '@douyinfe/semi-ui';

interface ProcessingTimesProps {
  processingTimes?: {
    interval?: number;
    lastRun?: number;
  };
}

export default function ProcessingTimes({ processingTimes = {} }: ProcessingTimesProps) {
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
              {processingTimes.lastRun && processingTimes.interval
                ? format(processingTimes.lastRun + processingTimes.interval * 60000)
                : null}
            </Descriptions.Item>
          </>
        )}
      </Descriptions>
    </>
  );
}
