/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef } from 'react';
import { Link } from 'react-router';

import Headline from '../../components/headline/Headline.jsx';
import { IconChevronRight } from '../../components/icons/StrokeIcons.jsx';
import { availableLanguages, useTranslation } from '../../services/i18n/i18n.jsx';
import { useSelector } from '../../services/state/store.js';
import { normalizeTheme } from '../../services/theme/theme.js';
import { SETTINGS_PAGE_ICONS } from './settingsPageIcons.js';
import { ADMIN_SETTINGS_PAGES, USER_SETTINGS_PAGES } from './settingsPages.js';

import './SettingsIndex.less';

/**
 * One row of the list: the page's icon and name, what it is set to where that fits in a word or
 * two, and the way in.
 *
 * @param {Object} props
 * @param {import('./settingsPages.js').SettingsPage} props.page
 * @param {React.ReactNode} [props.state]
 * @param {boolean} [props.alert] The state is something switched on that should not stay on.
 * @returns {React.ReactElement}
 */
function Row({ page, state = null, alert = false }) {
  const t = useTranslation();
  const Icon = SETTINGS_PAGE_ICONS[page.icon];
  return (
    <Link className="settingsIndex__row" to={page.path}>
      <span className="settingsIndex__icon">{Icon && <Icon />}</span>
      <span className="settingsIndex__label">{t(page.labelKey)}</span>
      {state != null && (
        <span className={`settingsIndex__state${alert ? ' settingsIndex__state--alert' : ''}`}>{state}</span>
      )}
      <IconChevronRight className="settingsIndex__chevron" />
    </Link>
  );
}

Row.displayName = 'Row';

/**
 * Every settings page on one list, for a phone, where a strip of fourteen tabs in two areas does not
 * fit and a strip that scrolls sideways hides most of them.
 *
 * Shown at `/settings` and at `/admin` instead of the redirect to the first page a wide screen gets.
 * It is one list for both areas, split by whose settings they are, which is what the badge beside
 * each page's heading says: the personal half applies to whoever is signed in, the administration
 * half to everyone on the instance and is only there for administrators. At `/admin` the list opens
 * scrolled to that half.
 *
 * A row says what its page is set to only where that is short and worth knowing at a glance:
 * appearance and language, and debug capture while it is running, in red like its tab.
 *
 * @param {Object} props
 * @param {'user'|'instance'} [props.focus] The half to scroll to.
 * @returns {React.ReactElement}
 */
export default function SettingsIndex({ focus = 'user' }) {
  const t = useTranslation();
  const isAdmin = useSelector((state) => state.user.currentUser?.isAdmin === true);
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));
  const language = useSelector((state) => state.userSettings.settings.language) ?? 'en';
  const debugOn = useSelector((state) => state.generalSettings.settings?.debug_logging_enabled === true);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (focus === 'instance') instanceRef.current?.scrollIntoView({ block: 'start' });
  }, [focus]);

  const languageName = availableLanguages.find((entry) => entry.code === language)?.name ?? language;
  const states = {
    '/settings/preferences': `${t(theme === 'dark' ? 'settings.themeDark' : 'settings.themeLight')} · ${languageName}`,
  };

  return (
    <div className="settingsIndex">
      <Headline text={t('settings.title')} />

      <section className="settingsIndex__section settingsIndex__section--user" aria-labelledby="settingsIndex-user">
        <header className="settingsIndex__header">
          <h2 id="settingsIndex-user" className="settingsIndex__title">
            {t('settings.indexPersonal')}
          </h2>
          <span className="settingsIndex__scope">{t('settings.scopeUser')}</span>
        </header>
        {USER_SETTINGS_PAGES.map((page) => (
          <Row key={page.path} page={page} state={states[page.path]} />
        ))}
      </section>

      {isAdmin && (
        <section
          ref={instanceRef}
          className="settingsIndex__section settingsIndex__section--instance"
          aria-labelledby="settingsIndex-instance"
        >
          <header className="settingsIndex__header">
            <h2 id="settingsIndex-instance" className="settingsIndex__title">
              {t('nav.administration')}
            </h2>
            <span className="settingsIndex__scope">{t('settings.indexInstanceScope')}</span>
          </header>
          {ADMIN_SETTINGS_PAGES.map((page) =>
            page.path === '/admin/debug' && debugOn ? (
              <Row key={page.path} page={page} state={t('settings.indexDebugOn')} alert />
            ) : (
              <Row key={page.path} page={page} />
            ),
          )}
        </section>
      )}
    </div>
  );
}

SettingsIndex.displayName = 'SettingsIndex';
