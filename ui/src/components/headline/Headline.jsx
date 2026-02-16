/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';

export default function Headline({ text, size = 3 } = {}) {
  const { Title } = Typography;
  return (
    <Title heading={size} style={{ marginBottom: '1rem' }}>
      {text}
    </Title>
  );
}
