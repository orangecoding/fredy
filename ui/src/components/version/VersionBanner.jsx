import React from 'react';
import { Banner, Descriptions } from '@douyinfe/semi-ui';
import { useSelector } from '../../services/state/store.js';
import { MarkdownRender } from '@douyinfe/semi-ui';

import './VersionBanner.less';

export default function VersionBanner() {
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  return (
    <Banner
      className="versionBanner"
      type="success"
      icon={null}
      description={
        <div style={{ overflow: 'auto' }}>
          <p>A new version of Fredy is available. Update now to take advantage of the latest features and bug fixes.</p>
          <Descriptions row size="small">
            <Descriptions.Item itemKey="Your Version">{versionUpdate.localFredyVersion}</Descriptions.Item>
            <Descriptions.Item itemKey="Latest Version">{versionUpdate.version}</Descriptions.Item>
            <Descriptions.Item itemKey="Github Release">
              <a href={versionUpdate.url} target="_blank" rel="noreferrer">
                {versionUpdate.url}
              </a>{' '}
            </Descriptions.Item>
          </Descriptions>
          <p>
            <b>
              <small>Release Notes</small>
            </b>
          </p>
          <MarkdownRender raw={versionUpdate.body} style={{ height: '200px' }} />
        </div>
      }
    />
  );
}
