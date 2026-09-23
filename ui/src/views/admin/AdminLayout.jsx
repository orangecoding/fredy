/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  IconAlertTriangle,
  IconFolder,
  IconGlobe,
  IconMapPin,
  IconRefresh,
  IconSignal,
  IconUserGroup,
} from '@douyinfe/semi-icons';

import ScopeBadge from '../../components/scopeBadge/ScopeBadge.jsx';
import SettingsShell from '../../components/settingsShell/SettingsShell.jsx';
import { useAdminSettings } from './useAdminSettings.js';
import { useUnsavedWarning } from '../../hooks/useUnsavedWarning.js';
import { useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Administration: everything that applies to the instance rather than to the person looking at it.
 *
 * The tabs are the only place these pages are named. The sidebar used to list them all as well,
 * directly above a strip repeating them, so it carries a single "Administration" entry now.
 *
 * The layout owns `useAdminSettings` so that System, Execution and Connectivity keep sharing one
 * form across a route change - switching tabs with unsaved edits must not silently discard them -
 * while each page still saves only its own fields.
 *
 * @returns {React.ReactElement}
 */
export default function AdminLayout() {
  const t = useTranslation();
  const settings = useSelector((state) => state.generalSettings.settings);
  const admin = useAdminSettings(settings);
  // Here as well as on each page: the form outlives a tab switch, so an edit left on System is still
  // unsaved while Routing is on screen, and a closed tab must still ask about it.
  useUnsavedWarning(admin.systemDirty || admin.executionDirty || admin.connectivityDirty || admin.routingDirty);

  const tabs = [
    { path: '/admin/system', label: t('admin.tabSystem'), icon: <IconSignal size="small" /> },
    { path: '/admin/execution', label: t('admin.tabExecution'), icon: <IconRefresh size="small" /> },
    { path: '/admin/routing', label: t('admin.tabRouting'), icon: <IconMapPin size="small" /> },
    { path: '/admin/connectivity', label: t('admin.tabConnectivity'), icon: <IconGlobe size="small" /> },
    { path: '/admin/users', label: t('admin.tabUsers'), icon: <IconUserGroup size="small" /> },
    { path: '/admin/backup', label: t('admin.tabBackup'), icon: <IconFolder size="small" /> },
    {
      path: '/admin/debug',
      label: t('admin.tabDebug'),
      // Red while capture is running, read from the same global flag the app-wide banner uses so
      // the label needs no status of its own.
      icon: (
        <IconAlertTriangle
          size="small"
          className={settings?.debug_logging_enabled ? 'settingsShell__tabIcon--alert' : undefined}
        />
      ),
    },
  ];

  // No standing line under the heading. The scope band that used to sit here said the same thing
  // on all seven tabs, every visit, and moving it into the subtitle only made it quieter noise -
  // "Administration" already says whose settings these are. The chip that replaces it is four words
  // beside the title, not a strip across the page, and it is there because each tab is a route of
  // its own.
  return <SettingsShell title={t('admin.title')} badge={<ScopeBadge scope="instance" />} tabs={tabs} context={admin} />;
}

AdminLayout.displayName = 'AdminLayout';
