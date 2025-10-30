import React from 'react';
import { Banner, MarkdownRender } from '@douyinfe/semi-ui';

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
