/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Banner } from '@douyinfe/semi-ui-19';

import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Persistent, non-dismissable banner shown on every page of a demo instance.
 *
 * Exists as its own component purely so the copy can be translated: `App` renders the
 * `I18nProvider` itself and therefore cannot call `useTranslation()` in its own body.
 *
 * @returns {JSX.Element}
 */
export default function DemoBanner() {
  const t = useTranslation();
  return (
    <>
      <Banner fullMode={true} type="info" bordered closeIcon={null} description={t('app.demoBanner')} />
      <br />
    </>
  );
}

DemoBanner.displayName = 'DemoBanner';
