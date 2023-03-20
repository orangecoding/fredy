import React from 'react';
import { Banner } from '@douyinfe/semi-ui';

export default function Help({ readme }) {
  return (
    <Banner
      fullMode={false}
      type="info"
      closeIcon={null}
      title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Information</div>}
      description={<p dangerouslySetInnerHTML={{ __html: readme }} />}
    />
  );
}
