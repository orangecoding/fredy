/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconGlobeStroke } from '@douyinfe/semi-icons';

import { useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './ScopeBanner.less';

/**
 * The band that says who a page's settings apply to.
 *
 * It is the one piece of chrome that separates Administration from the personal settings, and it
 * earns its place by being absent everywhere else: no band means the page is yours. That is a
 * faster read than any wording on an individual field, which is what the old single settings page
 * had to rely on and what nobody ever noticed.
 *
 * @returns {React.ReactElement}
 */
export default function ScopeBanner() {
  const t = useTranslation();
  const baseUrl = useSelector((state) => state.generalSettings.settings.baseUrl);

  return (
    <div className="scopeBanner">
      <IconGlobeStroke size="small" className="scopeBanner__icon" />
      <span className="scopeBanner__label">{t('admin.scopeLabel')}</span>
      <span className="scopeBanner__text">{t('admin.scopeText')}</span>
      {baseUrl ? <span className="scopeBanner__instance">{baseUrl}</span> : null}
    </div>
  );
}

ScopeBanner.displayName = 'ScopeBanner';
