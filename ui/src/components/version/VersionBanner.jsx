import React from 'react';
import { Banner, Descriptions } from '@douyinfe/semi-ui';
import { useSelector } from '../../services/state/store.js';

import './VersionBanner.less';

export default function VersionBanner() {
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  return (
    <Banner
      className="versionBanner"
      type="success"
      icon={null}
      description={
        <div>
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
          <pre>{stripFullChangelog(versionUpdate.body)}</pre>
        </div>
      }
    />
  );

  function stripFullChangelog(text) {
    if (text == null) {
      return '';
    }
    return text.replace(/(?:\r?\n)\*\*Full Changelog\*\*[\s\S]*$/u, '');
  }
}
