/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Banner, MarkdownRender } from '@douyinfe/semi-ui-19';

export default function Help({ readme }) {
  return (
    <Banner
      fullMode={false}
      type="info"
      closeIcon={null}
      title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Information</div>}
      description={<MarkdownRender raw={readme} />}
    />
  );
}
