/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IconAlertTriangle } from '@douyinfe/semi-icons';

import ScopeBadge from '../../components/scopeBadge/ScopeBadge.jsx';
import SettingsShell from '../../components/settingsShell/SettingsShell.jsx';
import { useAdminSettings } from './useAdminSettings.js';
import { useUnsavedWarning } from '../../hooks/useUnsavedWarning.js';
import { useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { SETTINGS_PAGE_ICONS } from '../settings/settingsPageIcons.js';
import { ADMIN_SETTINGS_PAGES } from '../settings/settingsPages.js';

/**
 * Administration: everything that applies to the instance rather than to the person looking at it.
 *
 * The column beside the page is the only place these pages are named on a wide screen, the list at
 * `/admin` on a phone. The sidebar used to list them all as well, so it carries a single
 * "Administration" entry.
 *
 * The layout owns `useAdminSettings` so that System, Execution and Connectivity keep sharing one
 * form across a route change - switching pages with unsaved edits must not silently discard them -
 * while each page still saves only its own fields.
 *
 * @returns {React.ReactElement}
 */
export default function AdminLayout() {
  const t = useTranslation();
  const settings = useSelector((state) => state.generalSettings.settings);
  const admin = useAdminSettings(settings);
  // Here as well as on each page: the form outlives a page switch, so an edit left on System is still
  // unsaved while Routing is on screen, and a closed tab must still ask about it.
  useUnsavedWarning(admin.systemDirty || admin.executionDirty || admin.connectivityDirty || admin.routingDirty);

  // Each page with its icon, and one state on top: a red mark beside Debug while capture is running,
  // read from the same global flag the app-wide banner uses, so the label needs no status of its
  // own. Off, there is nothing to show. The pages are defined in `settingsPages.js`, which the
  // phone's list reads as well.
  const tabs = ADMIN_SETTINGS_PAGES.map((page) => ({
    path: page.path,
    label: t(page.labelKey),
    icon: SETTINGS_PAGE_ICONS[page.icon],
    flag:
      page.path === '/admin/debug' && settings?.debug_logging_enabled ? (
        <IconAlertTriangle size="small" className="settingsShell__subnavAlert" />
      ) : undefined,
  }));

  // No standing line under the heading. The scope band that used to sit here said the same thing
  // on all seven pages, every visit, and moving it into a subtitle only made it quieter noise. The
  // chip that replaces it is four words beside the title, not a strip across the page, and it is
  // there because each page is a route of its own.
  return (
    <SettingsShell
      title={t('admin.title')}
      hint={t('settings.indexInstanceScope')}
      badge={<ScopeBadge scope="instance" />}
      tabs={tabs}
      crumbs={[
        { path: '/settings', label: t('nav.settings') },
        { path: '/admin', label: t('nav.administration') },
      ]}
      context={admin}
    />
  );
}

AdminLayout.displayName = 'AdminLayout';
