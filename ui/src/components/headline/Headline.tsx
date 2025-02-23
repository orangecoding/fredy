import React from 'react';
import { Typography } from '@douyinfe/semi-ui';

interface HeadlineProps {
  text: string;
  size?: 1 | 2 | 3 | 4 | 5 | 6;
}

export default function Headline({ text, size = 3 }: HeadlineProps) {
  const { Title } = Typography;
  return (
    <Title heading={size} style={{ marginBottom: '1rem' }}>
      {text}
    </Title>
  );
}
