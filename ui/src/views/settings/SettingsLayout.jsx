/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconHome, IconMapPin, IconListView } from '@douyinfe/semi-icons';

import SettingsShell from '../../components/settingsShell/SettingsShell.jsx';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Settings that belong to whoever is looking at the page.
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
  ];

  return <SettingsShell title={t('settings.title')} tabs={tabs} />;
}

SettingsLayout.displayName = 'SettingsLayout';
