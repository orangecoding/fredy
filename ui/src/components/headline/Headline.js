import React from 'react';
import { Header } from 'semantic-ui-react';

import './Headline.less';

export default function Headline({ text, size = 'medium', className = '' } = {}) {
  return (
    <Header className={`headline ${className}`} size={size}>
      {text}
    </Header>
  );
}
