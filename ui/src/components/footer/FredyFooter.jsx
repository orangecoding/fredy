/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './FredyFooter.less';
import { useSelector } from '../../services/state/store.js';
import { Layout } from '@douyinfe/semi-ui-19';

export default function FredyFooter() {
  const { Footer } = Layout;
  const version = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <Footer className="fredyFooter">
      <span className="fredyFooter__version">Fredy v{version?.localFredyVersion || 'N/A'}</span>
      <span className="fredyFooter__credit">
        Made with ❤️ by{' '}
        <a href="https://github.com/orangecoding" target="_blank" rel="noreferrer">
          Christian Kellner
        </a>
      </span>
    </Footer>
  );
}
