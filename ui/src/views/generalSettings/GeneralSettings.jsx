/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tabs, TabPane } from '@douyinfe/semi-ui-19';
import { IconSignal, IconRefresh, IconHome, IconFolder, IconAlertTriangle } from '@douyinfe/semi-icons';

import { useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import Headline from '../../components/headline/Headline.jsx';
import { useAdminSettings, SystemSettingsTab, ExecutionSettingsTab } from './panels/AdminSettingsPanel.jsx';
import UserPreferencesPanel from './panels/UserPreferencesPanel.jsx';
import BackupPanel from './panels/BackupPanel.jsx';
import DebugPanel from './panels/DebugPanel.jsx';

import './GeneralSettings.less';

/**
 * A tab label: an icon and its caption.
 *
 * @param {Object} props
 * @param {React.ComponentType} props.Icon
 * @param {string} props.label
 * @param {string} [props.color] Overrides the icon colour, used to flag active debug capture.
 * @returns {React.ReactElement}
 */
function TabLabel({ Icon, label, color }) {
  return (
    <span>
      <Icon size="small" style={{ marginRight: 6, color }} />
      {label}
    </span>
  );
}

TabLabel.displayName = 'TabLabel';

/**
 * The settings page: a tab strip, and which tabs the current user gets.
 *
 * This used to be a single 1030-line component holding instance configuration, per-user
 * preferences, backup/restore and debug capture together, with roughly twenty-five `useState`
 * hooks and one effect re-seeding ten of them. Any change to one concern re-rendered all four,
 * and there was no seam at which to gate the operator half.
 *
 * Each concern now owns its state and its requests, and the ones an ordinary user has no business
 * with are simply not mounted for them. The backend enforces the same split - it refuses those
 * writes and no longer even sends the values - so this is the visible half of a rule that holds on
 * both sides.
 *
 * The `TabPane` wrappers stay here rather than moving into the panels: Semi's `Tabs` reads `tab`
 * and `itemKey` off its direct children, so a pane hidden inside a component is invisible to it.
 */
const GeneralSettings = function GeneralSettings() {
  const t = useTranslation();
  const settings = useSelector((state) => state.generalSettings.settings);
  const currentUser = useSelector((state) => state.user.currentUser);
  const isAdmin = currentUser?.isAdmin === true;

  // Hooks cannot be called conditionally, so the operator state is always prepared; it is simply
  // unused when the tabs that read it are not rendered.
  const admin = useAdminSettings(settings);

  return (
    <div className="generalSettings">
      <Headline text={t('settings.title')} />
      {/* No slide-in when switching tabs: this is a settings page, not a carousel, and the
          content jumping in from the right on every click is a distraction. */}
      <Tabs type="line" tabPaneMotion={false}>
        {/* Operator configuration. A regular user is not shown these at all, rather than being
            shown fields whose save would be rejected. */}
        {isAdmin && (
          <TabPane tab={<TabLabel Icon={IconSignal} label={t('settings.tabSystem')} />} itemKey="system">
            <SystemSettingsTab {...admin} />
          </TabPane>
        )}
        {isAdmin && (
          <TabPane tab={<TabLabel Icon={IconRefresh} label={t('settings.tabExecution')} />} itemKey="execution">
            <ExecutionSettingsTab {...admin} />
          </TabPane>
        )}

        {/* Always open: these belong to whoever is looking at the page. */}
        <TabPane tab={<TabLabel Icon={IconHome} label={t('settings.tabUserSettings')} />} itemKey="userSettings">
          <UserPreferencesPanel />
        </TabPane>

        <TabPane tab={<TabLabel Icon={IconFolder} label={t('settings.tabBackup')} />} itemKey="backup">
          <BackupPanel demoMode={settings?.demoMode === true} isAdmin={isAdmin} />
        </TabPane>

        {/* Captured logs contain whatever the instance was doing, search URLs included. The icon
            turns red while capture is running, read from the same global flag the app-wide banner
            uses so the label needs no status of its own. */}
        {isAdmin && (
          <TabPane
            tab={
              <TabLabel
                Icon={IconAlertTriangle}
                label={t('settings.tabDebug')}
                color={settings?.debug_logging_enabled ? 'var(--semi-color-danger)' : undefined}
              />
            }
            itemKey="debug"
          >
            <DebugPanel />
          </TabPane>
        )}
      </Tabs>
    </div>
  );
};

GeneralSettings.displayName = 'GeneralSettings';

export default GeneralSettings;
