import React from 'react';
import { Header, Icon, Popup, Segment } from 'semantic-ui-react';

import './SegmentParts.less';

export const SegmentPart = ({ name, icon = null, children, helpText }) => (
  <Segment inverted>
    <Header as="h5" inverted sub>
      {icon && <Icon name={icon} inverted size="mini" />}
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
    <Segment inverted className="segmentParts">
      {children}
    </Segment>
  </Segment>
);
