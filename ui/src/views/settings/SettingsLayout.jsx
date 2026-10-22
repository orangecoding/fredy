/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ScopeBadge from '../../components/scopeBadge/ScopeBadge.jsx';
import SettingsShell from '../../components/settingsShell/SettingsShell.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Settings that belong to whoever is looking at the page.
 *
 * The tabs are the only place these pages are named. The sidebar used to list them as well,
 * directly above a tab strip saying the same words, so it carries a single "Settings" entry
 * now and the strip does the rest.
 *
 * Each tab is still its own route, which is what keeps a settings page something you can link to,
 * bookmark and reload onto rather than a tab index that resets on every visit.
 *
 * Whose settings these are is said by a chip next to the heading rather than by a band above the
 * content. The absence of a band was the statement while this was one page; it stopped being one
 * when every tab became a route somebody can arrive on directly.
 *
 * The tabs carry words only. They used to carry an icon each, which the strip no longer draws: six
 * pictograms in a row said nothing the six labels beside them did not.
 *
 * @returns {React.ReactElement}
 */
export default function SettingsLayout() {
  const t = useTranslation();

  const tabs = [
    { path: '/settings/preferences', label: t('settings.tabPreferences') },
    { path: '/settings/travel-time', label: t('settings.tabTravelTime') },
    { path: '/settings/listings', label: t('settings.tabListingDetails') },
    { path: '/settings/application', label: t('settings.tabApplication') },
    { path: '/settings/notifications', label: t('settings.tabNotifications') },
    { path: '/settings/connections', label: t('settings.tabConnections') },
  ];

  return (
    <SettingsShell
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      badge={<ScopeBadge scope="user" />}
      tabs={tabs}
    />
  );
}

SettingsLayout.displayName = 'SettingsLayout';
