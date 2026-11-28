/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router';
import {
  IconBellStroked,
  IconCalendarClockStroked,
  IconChainStroked,
  IconChecklistStroked,
  IconClockStroked,
  IconCodeStroked,
  IconGlobeStroked,
  IconIdCardStroked,
  IconIssueStroked,
  IconMailStroked,
  IconMapPinStroked,
  IconSaveStroked,
  IconServerStroked,
  IconSettingStroked,
} from '@douyinfe/semi-icons';

import Headline from '../headline/Headline.jsx';
import { IconChevronRight } from '../icons/StrokeIcons.jsx';
import { useIsPhone } from '../../hooks/screenWidth.js';
import { useSelector } from '../../services/state/store.js';
import { availableLanguages, useTranslation } from '../../services/i18n/i18n.jsx';
import { normalizeTheme } from '../../services/theme/theme.js';
import { ADMIN_SETTINGS, PERSONAL_SETTINGS, settingsAreasFor } from './settingsPages.js';

import './SettingsIndex.less';

/**
 * The icon in front of each row, by the name `settingsPages.js` gives it.
 * @type {Record<string, React.ComponentType>}
 */
const PAGE_ICONS = {
  preferences: IconSettingStroked,
  travelTime: IconClockStroked,
  listingDetails: IconChecklistStroked,
  application: IconMailStroked,
  notifications: IconBellStroked,
  connections: IconChainStroked,
  mcpServer: IconCodeStroked,
  system: IconServerStroked,
  execution: IconCalendarClockStroked,
  routing: IconMapPinStroked,
  connectivity: IconGlobeStroked,
  users: IconIdCardStroked,
  backup: IconSaveStroked,
  debug: IconIssueStroked,
};

/**
 * Every setting on one list: what a phone shows instead of the two tab strips.
 *
 * Seven tabs in a strip that scrolls sideways showed three or four of them and left the rest to be
 * guessed. A list shows all of them, grouped by whose settings they are - the same words the scope
 * badge beside each page's heading uses - and every page is one tap away.
 *
 * A row carries a short state on the right where one is worth knowing before opening the page.
 *
 * @param {Object} props
 * @param {'user'|'instance'} [props.focus] Scroll this area's heading into view on arrival: the menu's
 *   Administration entry and the back arrow of an administration page land here.
 * @returns {React.ReactElement}
 */
export function SettingsIndex({ focus = 'user' }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const isAdmin = useSelector((state) => state.user.currentUser?.isAdmin === true);
  const userSettings = useSelector((state) => state.userSettings.settings);
  const debugOn = useSelector((state) => state.generalSettings.settings?.debug_logging_enabled === true);
  const instanceHeading = useRef(null);

  useEffect(() => {
    if (focus === 'instance') {
      instanceHeading.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [focus]);

  const languageName = availableLanguages.find((language) => language.code === userSettings.language)?.name;
  const theme = normalizeTheme(userSettings.theme);

  /**
   * The short state a row shows on the right, if any.
   * @param {string} path
   * @returns {React.ReactNode}
   */
  const stateOf = (path) => {
    if (path === '/settings/preferences') {
      return [t(theme === 'dark' ? 'settings.themeDark' : 'settings.themeLight'), languageName]
        .filter(Boolean)
        .join(' · ');
    }
    if (path === '/admin/debug' && debugOn) {
      return (
        <span className="settingsIndex__flag">
          <span className="settingsShell__cardFlagDot settingsShell__cardFlagDot--live" />
          {t('settings.debugOn')}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="settingsIndex">
      <Headline text={t('settings.title')} />
      {settingsAreasFor(isAdmin).map((area) => (
        <section key={area.scope} className="settingsIndex__area" aria-labelledby={`settingsIndex-${area.scope}`}>
          <h2
            id={`settingsIndex-${area.scope}`}
            ref={area.scope === 'instance' ? instanceHeading : undefined}
            className="settingsIndex__heading"
          >
            {t(area.scope === 'user' ? 'settings.indexPersonal' : area.titleKey)}
            <span className="settingsIndex__scope">
              {t(area.scope === 'user' ? 'settings.scopeUser' : 'settings.scopeInstance')}
            </span>
          </h2>
          <ul className="settingsIndex__list">
            {area.pages.map((page) => {
              const Icon = PAGE_ICONS[page.icon];
              const state = stateOf(page.path);
              return (
                <li key={page.path}>
                  <button type="button" className="settingsIndex__row" onClick={() => navigate(page.path)}>
                    <span className="settingsIndex__icon">{Icon && <Icon />}</span>
                    <span className="settingsIndex__label">{t(page.labelKey)}</span>
                    {state != null && state !== '' && <span className="settingsIndex__state">{state}</span>}
                    <IconChevronRight className="settingsIndex__chevron" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

SettingsIndex.displayName = 'SettingsIndex';

/**
 * What `/settings` and `/admin` without a sub-page show.
 *
 * On a phone, the list. Elsewhere the first tab, as it always was: the strip already names every
 * page, and a list above it would name them twice.
 *
 * @param {Object} props
 * @param {'user'|'instance'} props.scope Which of the two areas this is the root of.
 * @returns {React.ReactElement}
 */
export default function SettingsIndexRoute({ scope }) {
  const isPhone = useIsPhone();
  const area = scope === 'instance' ? ADMIN_SETTINGS : PERSONAL_SETTINGS;
  if (!isPhone) {
    return <Navigate to={area.pages[0].path} replace />;
  }
  return <SettingsIndex focus={scope} />;
}

SettingsIndexRoute.displayName = 'SettingsIndexRoute';
