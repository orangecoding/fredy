import React from 'react';
import { format } from '../../services/time/timeService';
import { Label } from 'semantic-ui-react';

export default function ProcessingTimes({ processingTimes }) {
  return (
    <React.Fragment>
      <Label as="span" color="black">
        Processing Interval:
        <Label.Detail>{processingTimes.interval} min</Label.Detail>
      </Label>
      {processingTimes.lastRun && (
        <React.Fragment>
          <Label as="span" color="black">
            Last run:
            <Label.Detail>{format(processingTimes.lastRun)}</Label.Detail>
          </Label>
          <Label as="span" color="black">
            Next run:
            <Label.Detail>{format(processingTimes.lastRun + processingTimes.interval * 60000)}</Label.Detail>
          </Label>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}
