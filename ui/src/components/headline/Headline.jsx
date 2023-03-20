import React from 'react';
import { Typography } from '@douyinfe/semi-ui';

export default function Headline({ text, size = 3 } = {}) {
  const { Title } = Typography;
  return (
    <Title heading={size} style={{ marginBottom: '1rem' }}>
      {text}
    </Title>
  );
}
