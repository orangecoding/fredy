/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './FredyFooter.less';
import { useSelector } from '../../services/state/store.js';
import { Layout } from '@douyinfe/semi-ui-19';
import { useTranslation } from '../../services/i18n/i18n.jsx';

export default function FredyFooter() {
  const t = useTranslation();
  const { Footer } = Layout;
  const version = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <Footer className="fredyFooter">
      <span className="fredyFooter__version">Fredy v{version?.localFredyVersion || t('common.na')}</span>
      <span className="fredyFooter__credit">
        {t('footer.madeWith')}{' '}
        <a href="https://github.com/orangecoding" target="_blank" rel="noreferrer">
          Christian Kellner
        </a>
      </span>
    </Footer>
  );
}
