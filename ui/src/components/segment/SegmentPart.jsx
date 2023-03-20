import React from 'react';
import { Card } from '@douyinfe/semi-ui';

import './SegmentParts.less';

export const SegmentPart = ({ name, Icon = null, children, helpText }) => {
  const { Meta } = Card;

  return (
    <Card
      title={
        <Meta title={name} description={helpText} avatar={Icon == null ? null : <Icon size="extra-extra-small" />} />
      }
    >
      {children}
    </Card>
  );
};

/*

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
 */
