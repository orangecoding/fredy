/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconHome, IconMapPin, IconListView, IconBell, IconKey } from '@douyinfe/semi-icons';

import SettingsShell from '../../components/settingsShell/SettingsShell.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Settings that belong to whoever is looking at the page.
 *
 * The tabs are the only place these five pages are named. The sidebar used to list them as well,
 * directly above a tab strip saying the same words, so it carries a single "Settings" entry
 * now and the strip does the rest.
 *
 * Each tab is still its own route, which is what keeps a settings page something you can link to,
 * bookmark and reload onto rather than a tab index that resets on every visit.
 *
 * Nothing here affects anyone else, which is why there is no scope band: on a personal page the
 * absence of one is the statement. Instance configuration lives under Administration and is not
 * reachable from here at all.
 *
 * @returns {React.ReactElement}
 */
export default function SettingsLayout() {
  const t = useTranslation();

  const tabs = [
    { path: '/settings/preferences', label: t('settings.tabPreferences'), icon: <IconHome size="small" /> },
    { path: '/settings/travel-time', label: t('settings.tabTravelTime'), icon: <IconMapPin size="small" /> },
    { path: '/settings/listings', label: t('settings.tabListingDetails'), icon: <IconListView size="small" /> },
    { path: '/settings/notifications', label: t('settings.tabNotifications'), icon: <IconBell size="small" /> },
    { path: '/settings/connections', label: t('settings.tabConnections'), icon: <IconKey size="small" /> },
  ];

  return <SettingsShell title={t('settings.title')} tabs={tabs} />;
}

SettingsLayout.displayName = 'SettingsLayout';
