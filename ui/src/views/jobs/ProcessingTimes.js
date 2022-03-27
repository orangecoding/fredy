import React from 'react';
import { format } from '../../services/time/timeService';
import { Header, Label, Message, Segment } from 'semantic-ui-react';

export default function ProcessingTimes({ processingTimes }) {
  return (
    <React.Fragment>
      <div>
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
      </div>
      {processingTimes.scrapingAntData != null && (
        <Segment inverted>
          <Header as="h5">Remaining ScrapingAnt calls</Header>
          <Message.List>
            <Message.Item>Plan: {processingTimes.scrapingAntData.plan_name}</Message.Item>
            <Message.Item>
              Duration: {format(new Date(processingTimes.scrapingAntData.start_date))} -{' '}
              {format(new Date(processingTimes.scrapingAntData.end_date))}
            </Message.Item>
            <Message.Item>
              Credits: {processingTimes.scrapingAntData.remained_credits}/
              {processingTimes.scrapingAntData.plan_total_credits} (250 credits per call)
            </Message.Item>
          </Message.List>
          If you want to scrape Immoscout more often, you have to purchase a premium account of{' '}
          <a href="https://scrapingant.com/" target="_blank" rel="noreferrer">
            {' '}
            ScrapingAnt
          </a>
          . You can use the code <b>FREDY10</b> to get 10% off. (No affiliation, we are <b>not</b> getting paid to
          recommend ScrapingAnt.
        </Segment>
      )}
    </React.Fragment>
  );
}
