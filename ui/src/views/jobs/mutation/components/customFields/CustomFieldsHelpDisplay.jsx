import React from 'react';
import { Banner } from '@douyinfe/semi-ui';

export default function CustomFieldsHelpDisplay({ helpText }) {
  return (
    <Banner
      fullMode={false}
      type="info"
      closeIcon={null}
      title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Custom Fields Information</div>}
      description={<p dangerouslySetInnerHTML={{ __html: helpText }} />}
    />
  );
}
