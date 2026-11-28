/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ScopeBadge from '../../components/scopeBadge/ScopeBadge.jsx';
import SettingsShell from '../../components/settingsShell/SettingsShell.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { SETTINGS_PAGE_ICONS } from './settingsPageIcons.js';
import { USER_SETTINGS_PAGES } from './settingsPages.js';

/**
 * Settings that belong to whoever is looking at the page.
 *
 * The column beside the page is the only place these pages are named on a wide screen, the list at
 * `/settings` on a phone. The sidebar used to list them as well, directly above a strip of tabs
 * saying the same words, so it carries a single "Settings" entry.
 *
 * Each page is its own route, which is what keeps a settings page something you can link to,
 * bookmark and reload onto rather than a tab index that resets on every visit.
 *
 * Whose settings these are is said at the top of the column and by a chip next to the heading
 * rather than by a band above the content. The chip is for somebody arriving on a page from a link,
 * who starts reading at the heading.
 *
 * The pages, their names and their icons are defined in `settingsPages.js` and
 * `settingsPageIcons.js`, which the phone's list reads as well.
 *
 * @returns {React.ReactElement}
 */
export default function SettingsLayout() {
  const t = useTranslation();

  const tabs = USER_SETTINGS_PAGES.map((page) => ({
    path: page.path,
    label: t(page.labelKey),
    icon: SETTINGS_PAGE_ICONS[page.icon],
  }));

  return (
    <SettingsShell
      title={t('settings.title')}
      hint={t('settings.scopeUser')}
      badge={<ScopeBadge scope="user" />}
      tabs={tabs}
      crumbs={[{ path: '/settings', label: t('nav.settings') }]}
    />
  );
}

SettingsLayout.displayName = 'SettingsLayout';
