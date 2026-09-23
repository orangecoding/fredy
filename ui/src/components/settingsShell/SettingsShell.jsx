/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tabs } from '@douyinfe/semi-ui-19';
import { Outlet, useLocation, useNavigate } from 'react-router';

import Headline from '../headline/Headline.jsx';

import './SettingsShell.less';

/**
 * The frame both settings areas share: a heading, a strip of sub-pages, and whatever the current
 * sub-route renders.
 *
 * The strip is driven by the URL rather than by internal tab state. That is the whole point of the
 * restructure: every settings page is a place you can link to, bookmark and reload onto, instead of
 * a tab index that resets to the first pane on every visit.
 *
 * @param {Object} props
 * @param {string} props.title Page heading.
 * @param {React.ReactNode} [props.subtitle] Who the area's settings apply to, and what it leaves
 *   out. Administration used to state this as a full-width coloured band on all seven of its tabs,
 *   which is what `Headline`'s own documentation argues against: a band reads as "something just
 *   happened", and this is true on every visit.
 * @param {React.ReactNode} [props.badge] Whose settings these are. See ScopeBadge.
 * @param {{path: string, label: string, icon?: React.ReactNode}[]} props.tabs Sub-pages, in order.
 * @param {React.ReactNode} [props.banner] Rendered between the heading and the strip, for something
 *   that really did just happen. Standing facts belong in `subtitle`.
 * @param {any} [props.context] Passed to the sub-route through `useOutletContext()`.
 * @returns {React.ReactElement}
 */
export default function SettingsShell({
  title,
  subtitle = null,
  badge = null,
  tabs,
  banner = null,
  context = undefined,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // Longest prefix wins, so a future '/admin/users/edit/:id' still marks the Users tab as current
  // instead of falling through to no selection at all.
  const activeKey =
    tabs
      .map((tab) => tab.path)
      .filter((path) => location.pathname === path || location.pathname.startsWith(path + '/'))
      .sort((a, b) => b.length - a.length)[0] ?? tabs[0]?.path;

  return (
    <div className="settingsShell">
      <Headline text={title} subtitle={subtitle} badge={badge} />
      {banner}
      <Tabs
        type="line"
        tabPaneMotion={false}
        activeKey={activeKey}
        tabBarClassName="settingsShell__tabbar"
        onTabClick={(key) => {
          if (key !== activeKey) {
            navigate(key);
          }
        }}
        tabList={tabs.map((tab) => ({ itemKey: tab.path, tab: tab.label, icon: tab.icon }))}
      />
      <div className="settingsShell__content">
        <Outlet context={context} />
      </div>
    </div>
  );
}

SettingsShell.displayName = 'SettingsShell';
