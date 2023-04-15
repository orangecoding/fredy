import React from 'react';
import { format } from '../../services/time/timeService';
import { Card, Descriptions, Divider } from '@douyinfe/semi-ui';
import { IconBolt } from '@douyinfe/semi-icons';
export default function ProcessingTimes({ processingTimes }) {
  const { Meta } = Card;
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

      {processingTimes.scrapingAntData != null && (
        <>
          <Divider margin="1rem" />
          <Card
            style={{ backgroundColor: '#35363c' }}
            title={
              <Meta
                title="Remaining ScrapingAnt calls"
                description="Information about your Scraping Ant Plan"
                avatar={<IconBolt />}
              />
            }
          >
            <p>Plan: {processingTimes.scrapingAntData.plan_name}</p>
            <p>
              Duration: {format(new Date(processingTimes.scrapingAntData.start_date))} -{' '}
              {format(new Date(processingTimes.scrapingAntData.end_date))}
              <br />
              Credits: {processingTimes.scrapingAntData.remained_credits}/
              {processingTimes.scrapingAntData.plan_total_credits} (250 credits per call)
            </p>
            If you want to scrape Immoscout or Immonet more often, you have to purchase a premium account of{' '}
            <a href="https://scrapingant.com/" target="_blank" rel="noreferrer">
              ScrapingAnt
            </a>
            . You can use the code <b>FREDY10</b> to get 10% off. (No affiliation, we are <b>not</b> getting paid to
            recommend ScrapingAnt.)
          </Card>
        </>
      )}
    </>
  );
}

/*



 */
