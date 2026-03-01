/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Collapse, Descriptions } from '@douyinfe/semi-ui-19';
import { useSelector } from '../../services/state/store.js';
import { MarkdownRender } from '@douyinfe/semi-ui-19';

import './VersionBanner.less';

export default function VersionBanner() {
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  return (
    <Collapse>
      <Collapse.Panel header="A new version of Fredy is available" itemKey="1" className="versionBanner">
        <div className="versionBanner__content">
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
          <MarkdownRender raw={versionUpdate.body} />
        </div>
      </Collapse.Panel>
    </Collapse>
  );
}
