import React from 'react';

import { useDispatch, useSelector } from 'react-redux';

import { Button, Form, Icon, Message, Segment, Radio } from 'semantic-ui-react';
import ToastContext from '../../components/toasts/ToastContext';
import Headline from '../../components/headline/Headline';
import { xhrPost } from '../../services/xhr';
import { SegmentPart } from '../../components/segment/SegmentPart';
import './GeneralSettings.less';

const GeneralSettings = function Users() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);

  const settings = useSelector((state) => state.generalSettings.settings);

  const [interval, setInterval] = React.useState('');
  const [port, setPort] = React.useState('');
  const [scrapingAntApiKey, setScrapingAntApiKey] = React.useState('');
  const [scrapingAntProxy, setScrapingAntProxy] = React.useState('');
  const [workingHourFrom, setWorkingHourFrom] = React.useState(null);
  const [workingHourTo, setWorkingHourTo] = React.useState(null);
  const ctx = React.useContext(ToastContext);

  React.useEffect(() => {
    async function init() {
      await dispatch.generalSettings.getGeneralSettings();
      setLoading(false);
    }
    init();
  }, []);

  React.useEffect(() => {
    async function init() {
      setInterval(settings?.interval);
      setPort(settings?.port);
      setScrapingAntApiKey(settings?.scrapingAnt?.apiKey);
      setWorkingHourFrom(settings?.workingHours?.from);
      setWorkingHourTo(settings?.workingHours?.to);
      setScrapingAntProxy(settings?.scrapingAnt?.proxy || 'datacenter');
    }
    init();
  }, [settings]);

  const nullOrEmpty = (val) => val == null || val.length === 0;

  const throwMessage = (message, type) => {
    ctx.showToast({
      title: type === 'error' ? 'Error' : 'Success',
      message: message,
      delay: 5000,
      backgroundColor: type === 'error' ? '#db2828' : '#87eb8f',
      color: type === 'error' ? '#fff' : '#000',
    });
  };

  const onStore = async () => {
    if (nullOrEmpty(interval)) {
      throwMessage('Interval may not be empty.', 'error');
      return;
    }
    if (nullOrEmpty(port)) {
      throwMessage('Port may not be empty.', 'error');
      return;
    }
    if (
      (!nullOrEmpty(workingHourFrom) && nullOrEmpty(workingHourTo)) ||
      (nullOrEmpty(workingHourFrom) && !nullOrEmpty(workingHourTo))
    ) {
      throwMessage('Working hours to and from must be set if either to or from has been set before.', 'error');
      return;
    }
    try {
      await xhrPost('/api/admin/generalSettings', {
        interval,
        port,
        scrapingAnt: {
          apiKey: scrapingAntApiKey,
          proxy: scrapingAntProxy,
        },
        workingHours: {
          from: workingHourFrom,
          to: workingHourTo,
        },
      });
    } catch (exception) {
      console.error(exception);
      throwMessage('Error while trying to store settings.', 'error');
      return;
    }
    throwMessage('Settings stored successfully. You MUST restart Fredy.', 'success');
  };

  return (
    <div>
      {!loading && (
        <React.Fragment>
          <Headline text="General Settings" />
          <Message className="generalSettings__message">
            <h5>
              <Icon name="info circle" />
              Info
            </h5>
            <p>If you change any settings, you must restart Fredy afterwards.</p>
          </Message>
          <Form>
            <SegmentPart
              name="Interval"
              helpText="Interval in minutes for running queries against the configured services."
              icon="refresh"
            >
              <Form.Input
                type="number"
                min="0"
                max="1440"
                placeholder="Interval in minutes"
                inverted
                size="mini"
                width={6}
                defaultValue={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </SegmentPart>

            <SegmentPart name="Port" helpText="Port on which Fredy is running." icon="connectdevelop">
              <Form.Input
                type="number"
                min="0"
                max="99999"
                placeholder="Port"
                inverted
                size="mini"
                width={6}
                defaultValue={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </SegmentPart>

            <SegmentPart
              name="ScrapingAnt Api Key"
              helpText="The api key for ScrapingAnt is used to be able to scrape Immoscout."
              icon="key"
            >
              <Form.Input
                type="text"
                placeholder="ScrapingAnt Api Key"
                inverted
                size="mini"
                width={6}
                defaultValue={scrapingAntApiKey}
                onChange={(e) => setScrapingAntApiKey(e.target.value)}
              />
            </SegmentPart>

            <SegmentPart
              name="ScrapingAnt proxy settings"
              helpText="Scraping ant provides different proxies."
              icon="key"
            >
              <Message info>
                ScrapingAnt is needed to scrape Immoscout. ScrapingAnt itself is using 2 different types of proxies.{' '}
                <br />
                <h4>Datacenter-Proxy</h4>
                Proxy server located in one of the datacenters across the world. Datacenter proxies are slower and more
                likely to fail, but they are cheaper. A call with a datacenter proxy cost 10 credits.
                <h4>Residential-Proxy</h4>
                High-quality proxy server located in one of the real people houses across the world. Datacenter proxies
                are faster and more likely to success, but they are more expensive. A call with a datacenter proxy cost
                250 credits.
                <br />
                <br />
                <b>
                  On the free tier, you have 10.000 credits, so chose your option wisely. Keep in mind, only successful
                  calls will be charged.
                </b>
              </Message>
              <Form.Field>
                <Radio
                  label="Datacenter proxy"
                  name="scrapingAntProxy"
                  value="datacenter"
                  checked={scrapingAntProxy === 'datacenter'}
                  onChange={(e, { value }) => setScrapingAntProxy(value)}
                />
              </Form.Field>
              <Form.Field>
                <Radio
                  label="Residential proxy"
                  name="scrapingAntProxy"
                  value="residential"
                  checked={scrapingAntProxy === 'residential'}
                  onChange={(e, { value }) => setScrapingAntProxy(value)}
                />
              </Form.Field>
            </SegmentPart>

            <SegmentPart
              name="Working hours"
              helpText="During this hours, Fredy will search for new apartments. If nothing is configured, Fredy will search around the clock."
              icon="calendar outline"
            >
              <div className="generalSettings__timePickerContainer">
                <Form.Input
                  className="generalSettings__time"
                  type="time"
                  placeholder="Working hours from"
                  inverted
                  size="mini"
                  width={2}
                  defaultValue={workingHourFrom}
                  onChange={(e) => setWorkingHourFrom(e.target.value)}
                />
                <div className="generalSettings__until">until</div>
                <Form.Input
                  type="time"
                  placeholder="Working hours to"
                  inverted
                  size="mini"
                  width={2}
                  defaultValue={workingHourTo}
                  onChange={(e) => setWorkingHourTo(e.target.value)}
                />
              </div>
            </SegmentPart>

            <Segment inverted floated="right">
              <Button color="teal" onClick={onStore}>
                Save
              </Button>
            </Segment>
          </Form>
        </React.Fragment>
      )}
    </div>
  );
};

export default GeneralSettings;
