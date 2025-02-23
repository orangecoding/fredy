import React from 'react';
import { Banner } from '@douyinfe/semi-ui';

export default function Help({ readme }: { readme: string | TrustedHTML }) {
  return (
    <Banner
      fullMode={false}
      type="info"
      closeIcon={null}
      title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Information</div>}
      // eslint-disable-next-line react/no-danger
      description={<p dangerouslySetInnerHTML={{ __html: readme }} />}
    />
  );
}
