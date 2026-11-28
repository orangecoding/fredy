/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tabs } from '@douyinfe/semi-ui-19';
import { Outlet, useLocation, useNavigate } from 'react-router';

import Headline from '../headline/Headline.jsx';
import { useIsPhone } from '../../hooks/screenWidth.js';

import './SettingsShell.less';

/**
 * The frame both settings areas share: a heading, a strip of sub-pages, and whatever the current
 * sub-route renders.
 *
 * The strip is driven by the URL rather than by internal tab state. That is the whole point of the
 * restructure: every settings page is a place you can link to, bookmark and reload onto, instead of
 * a tab index that resets to the first pane on every visit.
 *
 * On a phone there is no strip. Seven tabs in a strip that scrolls sideways show three or four of
 * them; the phone gets a list of every page instead (`SettingsIndex`, the area's index route), and a
 * page opened from it names itself in the heading, with the way back above it as a breadcrumb and as
 * the back arrow in the app bar.
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
 * @param {string[]} [props.trail] On a phone, the names above the page in the breadcrumb, outermost
 *   first. Defaults to the area's title.
 * @returns {React.ReactElement}
 */
export default function SettingsShell({
  title,
  subtitle = null,
  badge = null,
  tabs,
  banner = null,
  context = undefined,
  trail = undefined,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isPhone = useIsPhone();

  // Longest prefix wins, so a future '/admin/users/edit/:id' still marks the Users tab as current
  // instead of falling through to no selection at all.
  const matchedKey = tabs
    .map((tab) => tab.path)
    .filter((path) => location.pathname === path || location.pathname.startsWith(path + '/'))
    .sort((a, b) => b.length - a.length)[0];
  const activeKey = matchedKey ?? tabs[0]?.path;

  // On a phone the area's own address is the list of every settings page, which brings its own
  // heading; a page opened from it names itself, under a breadcrumb back to the list.
  const atList = isPhone && matchedKey == null;
  const current = isPhone ? tabs.find((tab) => tab.path === matchedKey) : null;
  const crumbs = trail ?? [title];

  // One tree for both widths, with the parts switched on and off in place. Returning a different
  // tree on a phone remounted the page whenever the phone was turned across the breakpoint, and the
  // page took whatever had been typed into it along.
  return (
    <div className={`settingsShell${isPhone ? ' settingsShell--phone' : ''}`}>
      {!atList && (
        <Headline
          text={isPhone ? (current?.label ?? title) : title}
          overline={
            isPhone ? (
              <span className="settingsShell__crumbs">
                {crumbs.map((crumb, index) => (
                  <span key={crumb}>
                    {index > 0 && <span aria-hidden="true"> › </span>}
                    {crumb}
                  </span>
                ))}
              </span>
            ) : null
          }
          subtitle={subtitle}
          badge={badge}
        />
      )}
      {!atList && banner}
      {!isPhone && (
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
      )}
      <div className={`settingsShell__content${atList ? ' settingsShell__content--list' : ''}`}>
        <Outlet context={context} />
      </div>
    </div>
  );
}

SettingsShell.displayName = 'SettingsShell';
