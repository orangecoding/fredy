// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import { Banner } from '@douyinfe/semi-ui';

export default function Help({
  readme
}: any) {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Banner
      fullMode={false}
      type="info"
      closeIcon={null}
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Information</div>}
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      description={<p dangerouslySetInnerHTML={{ __html: readme }} />}
    />
  );
}
