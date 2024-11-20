import React from 'react';
import {format} from '../../services/time/timeService';
import {Banner, Card, Descriptions, Divider} from '@douyinfe/semi-ui';
import {IconBolt} from '@douyinfe/semi-icons';

export default function ProcessingTimes({processingTimes = {}}) {
    const {Meta} = Card;
    if (Object.keys(processingTimes).length === 0) {
        return null;
    }
    if (processingTimes.error != null) {
        return <Banner
            fullMode={false}
            type="danger"
            closeIcon={null}
            title={
                <div style={{fontWeight: 600, fontSize: '14px', lineHeight: '20px'}}>
                    Scraping Ant Error
                </div>
            }
            style={{marginBottom: '1rem'}}
            description={
                <div>
                    {processingTimes.error}
                </div>
            }
        />;
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

            {(processingTimes.scrapingAntData != null && Object.keys(processingTimes.scrapingAntData).length > 0) &&(
                <>
                    <Divider margin="1rem"/>
                    <Card
                        style={{backgroundColor: '#35363c'}}
                        title={
                            <Meta
                                title="Remaining ScrapingAnt calls"
                                description="Information about your Scraping Ant Plan"
                                avatar={<IconBolt/>}
                            />
                        }
                    >
                        <p>Plan: {processingTimes.scrapingAntData.plan_name}</p>
                        <p>
                            Duration: {format(new Date(processingTimes.scrapingAntData.start_date))} -{' '}
                            {format(new Date(processingTimes.scrapingAntData.end_date))}
                            <br/>
                            Credits: {processingTimes.scrapingAntData.remained_credits}/
                            {processingTimes.scrapingAntData.plan_total_credits}
                        </p>
                        If you want to scrape Immoscout or Immonet more often, you have to purchase a premium account
                        of{' '}
                        <a href="https://scrapingant.com/" target="_blank" rel="noreferrer">
                            ScrapingAnt
                        </a>
                        . You can use the code <b>FREDY10</b> to get 10% off. (No affiliation, we are <b>not</b> getting
                        paid by ScrapingAnt.)
                    </Card>
                </>
            )}
        </>
    );
}

/*



 */
