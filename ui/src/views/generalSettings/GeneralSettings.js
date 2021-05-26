import React from 'react';

import { useDispatch, useSelector } from 'react-redux';

import { Button, Form, Header, Icon, Message, Popup, Segment } from 'semantic-ui-react';
import ToastContext from '../../components/toasts/ToastContext';
import Headline from '../../components/headline/Headline';
import { xhrPost } from '../../services/xhr';

import './GeneralSettings.less';

const SegmentPart = ({ name, icon, children, helpText }) => (
  <React.Fragment>
    <Header as="h5" inverted attached="top" sub>
      <Icon name={icon} inverted size="mini" />
      <Header.Content>{name}</Header.Content>
    </Header>

    <Popup
      content={helpText}
      trigger={
        <span className="generalSettings__help">
          {' '}
          <Icon name="help circle" inverted />
          What is this?
        </span>
      }
    />
    <Segment inverted attached>
      {children}
    </Segment>
  </React.Fragment>
);

const GeneralSettings = function Users() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);

  const settings = useSelector((state) => state.generalSettings.settings);

  const [interval, setInterval] = React.useState('');
  const [port, setPort] = React.useState('');
  const [scrapingAntApiKey, setScrapingAntApiKey] = React.useState('');
  const [workingHourFrom, setWorkingHourFrom] = React.useState(null);
  const [workingHourTo, setWorkingHourTo] = React.useState(null);
  const ctx = React.useContext(ToastContext);

  React.useEffect(async () => {
    await dispatch.generalSettings.getGeneralSettings();
    setLoading(false);
  }, []);

  React.useEffect(async () => {
    setInterval(settings?.interval);
    setPort(settings?.port);
    setScrapingAntApiKey(settings?.scrapingAnt?.apiKey);
    setWorkingHourFrom(settings?.workingHours?.from);
    setWorkingHourTo(settings?.workingHours?.to);
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
          <Message info>
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
              name="Working hours"
              helpText="During this hours, Fredy will search for new apartments. If nothing is configured, Fredy will search around the clock."
              icon="calendar outline"
            >
              <div className="generalSettings__timePickerContainer">
                <Form.Input
                  className="generalSettings__time"
                  type="time"
                  placeholder="ScrapingAnt Api Key"
                  inverted
                  size="mini"
                  width={2}
                  defaultValue={workingHourFrom}
                  onChange={(e) => setWorkingHourFrom(e.target.value)}
                />
                <div className="generalSettings__until">until</div>
                <Form.Input
                  type="time"
                  placeholder="ScrapingAnt Api Key"
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
