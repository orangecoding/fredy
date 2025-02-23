// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import { Typography } from '@douyinfe/semi-ui';

export default function Headline({
  text,
  size = 3
}: any = {}) {
  const { Title } = Typography;
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Title heading={size} style={{ marginBottom: '1rem' }}>
      {text}
    </Title>
  );
}
