/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Fragment, useEffect, useState } from 'react';
import { Dropdown, Popover, Tooltip } from '@douyinfe/semi-ui-19';
import {
  IconStar,
  IconSetting,
  IconTerminal,
  IconHistogram,
  IconSidebar,
  IconServerStroked,
  IconChevronDown,
  IconChevronUp,
  IconQuit,
} from '@douyinfe/semi-icons';
import logo from '../../assets/logo.png';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import logout from '../logout/Logout.jsx';
import Donate from '../donate/Donate.jsx';
import ScopeBadge from '../scopeBadge/ScopeBadge.jsx';
import NewsHistory from '../news/NewsHistory.jsx';
import { useLocation, useNavigate } from 'react-router';
import { normalizeTheme } from '../../services/theme/theme.js';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useActions, useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
// A pure function that already answers exactly this question for the dashboard's own rows. A copy
// here would be a second set of rounding rules for the same clock.
import { relativeTime } from '../../services/time/relativeTime.js';
import { navTreeFor, resolveActiveKey, sectionScope, startsSection } from './navModel.js';

/** How long after a promised run the status is asked for again: the run itself takes a moment. */
const STATUS_REFRESH_GRACE_MS = 60 * 1000;

/** `setTimeout` overflows past about 24.8 days and would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * The icon each top-level entry carries. Keyed by nav key so the tree itself stays free of JSX.
 * @type {Record<string, React.ReactElement>}
 */
const ICONS = {
  '/dashboard': <IconHistogram />,
  '/jobs': <IconTerminal />,
  listings: <IconStar />,
  '/settings': <IconSetting />,
  '/admin': <IconServerStroked />,
};

/**
 * The brand: the wordmark when there is room for it, the heart alone when there is not.
 *
 * A bitmap with two cuts rather than a path, because this is the logo the project is known by and
 * no custom property can recolour a PNG into it. Which cut is read from the document rather than
 * from the store: it is an asset choice, and the app remounts on a theme change, so there is
 * nothing to subscribe to.
 *
 * Sized by height here, not by width. At 1500 by 624 the wordmark is two and a half times as wide
 * as it is tall, so a width that looks harmless resolves to a height taller than the header it
 * sits in - which is how the old header ended up a third of the sidebar.
 *
 * @param {Object} props
 * @param {boolean} props.collapsed
 * @returns {React.ReactElement}
 */
function Brand({ collapsed }) {
  // From the store, like App: the document attribute is only written in App's effect, after the
  // remount on a theme switch has already rendered this - which left the white cut on a light
  // sidebar until the next navigation.
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));
  if (collapsed) {
    return <img className="navigate__logoMark" src={heart} alt="Fredy" />;
  }
  return <img className="navigate__logo" src={theme === 'dark' ? logoWhite : logo} alt="Fredy" />;
}

Brand.displayName = 'Brand';

/**
 * The sidebar: the places this instance has, which of them the current URL is in, and the session
 * the user is in it as.
 *
 * Built out of buttons and a list rather than a component library's navigation, because every
 * feature the design asks for - the marker at the edge, the rail under a group, the counters, the
 * account row - was another override on top of markup this file does not own. `navModel.js` decides
 * what is in it and which entry a nested route counts as; this file decides how that looks.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin Whether administration is among the entries.
 * @returns {React.ReactElement}
 */
export default function Navigation({ isAdmin }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const width = useScreenWidth();
  const [collapsed, setCollapsed] = useState(width <= 850);
  const [toggledGroups, setToggledGroups] = useState({});

  useEffect(() => {
    if (width <= 850) {
      setCollapsed(true);
    }
  }, [width]);

  // Whose session this is. Already in the store from the call App makes before it renders anything,
  // so the sidebar asks nothing of its own.
  const username = useSelector((state) => state.user.currentUser?.username);

  // What the dashboard has fetched. Before that page has been open once there is no answer here and
  // the row is simply not drawn - no placeholder, no dash, nothing that pretends to know. Once there
  // is one, the sidebar asks again when it falls due (below).
  const nextRun = useSelector((state) => state.dashboard.data?.general?.nextRun);
  const actions = useActions();

  // That answer goes stale the moment the promised run comes round, and nothing else refreshes it
  // away from the dashboard - so the dot turned amber for anybody who had not opened the dashboard
  // for an interval, with the scheduler running fine. Asked again once the run is due, plus a
  // minute for the run itself: amber then means a fresh answer still points into the past.
  useEffect(() => {
    if (nextRun == null || nextRun === 0) return undefined;
    const delay = Math.min(Math.max(0, nextRun - Date.now()) + STATUS_REFRESH_GRACE_MS, MAX_TIMER_MS);
    const timer = setTimeout(() => actions.dashboard.getDashboard(), delay);
    return () => clearTimeout(timer);
  }, [nextRun]);

  const tree = navTreeFor(isAdmin);
  const activeKey = resolveActiveKey(tree, location.pathname);

  /**
   * Whether a group shows its children.
   *
   * A group the user has not touched follows its children, so a page reached from somewhere else
   * entirely - a link on the dashboard, a bookmark - does not mark an entry that is folded away.
   * Once the user has opened or closed one, that answer is theirs and stays.
   *
   * @param {import('./navModel.js').NavNode} node
   * @returns {boolean}
   */
  const isOpen = (node) => toggledGroups[node.key] ?? (node.children ?? []).some((child) => child.key === activeKey);

  /**
   * The children of a group, shown beside the rail instead of under it.
   *
   * The heading is not decoration: a menu of three bare names appearing next to an icon says
   * nothing about which icon it belongs to, and the rail has no room to say it.
   *
   * @param {import('./navModel.js').NavNode} node
   * @returns {React.ReactElement}
   */
  const flyout = (node) => (
    <div className="navigate-flyout">
      <div className="navigate-flyout__title">{t(node.labelKey)}</div>
      {node.children.map((child) => (
        <button
          key={child.key}
          type="button"
          className={`navigate-flyout__item${child.key === activeKey ? ' navigate-flyout__item--active' : ''}`}
          aria-current={child.key === activeKey ? 'page' : undefined}
          onClick={() => navigate(child.key)}
        >
          {t(child.labelKey)}
        </button>
      ))}
    </div>
  );

  const toggle = (
    <button
      type="button"
      className="navigate__toggle"
      onClick={() => setCollapsed(!collapsed)}
      aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
    >
      <IconSidebar size="default" />
    </button>
  );

  const accountMenu = (
    <Dropdown.Menu>
      <Dropdown.Item onClick={logout}>{t('nav.logout')}</Dropdown.Item>
    </Dropdown.Menu>
  );

  const initial = (username ?? '').charAt(0).toUpperCase();

  return (
    <nav className={`navigate${collapsed ? ' navigate--collapsed' : ''}`} aria-label={t('nav.landmark')}>
      <div className="navigate__header">
        <Brand collapsed={collapsed} />
        {!collapsed && (
          <>
            <span className="navigate__spacer" />
            {toggle}
          </>
        )}
      </div>

      <div className="navigate__list">
        {tree.map((node, index) => {
          // The one distinction the whole component turns on, and the same one `resolveActiveKey`
          // uses: a key with a leading slash is somewhere to go, anything else is a heading that
          // only opens.
          const isGroup = !node.key.startsWith('/');
          const open = isGroup && isOpen(node);
          // A group stands in for its children wherever they are not on screen - in the narrow rail,
          // and while it is folded. Otherwise /map or /listings marked nothing at all there.
          const holdsActive = isGroup && (node.children ?? []).some((child) => child.key === activeKey);
          const isActive = node.key === activeKey || (holdsActive && (collapsed || !open));
          const childrenId = `navigate-children-${node.key}`;
          // Null for everything under "the daily work": naming that section would be naming the
          // obvious, and an entry that announces nothing simply carries no popover.
          const scope = sectionScope(tree, index);

          const item = (
            <button
              type="button"
              className={`navigate__item${isActive ? ' navigate__item--active' : ''}`}
              // 'true' rather than 'page' on a group: it holds the current page, it is not it.
              aria-current={isActive ? (isGroup ? 'true' : 'page') : undefined}
              // Only while the children are a list under this entry. In the narrow rail they are a
              // menu beside it that opens on its own, and claiming to control an element that is
              // not there would be a lie told to a screen reader.
              aria-expanded={isGroup && !collapsed ? open : undefined}
              aria-controls={isGroup && !collapsed ? childrenId : undefined}
              onClick={() => {
                if (isGroup) {
                  // In the rail the children open as a menu beside the entry; a click there must not
                  // quietly fold or unfold the group for when the sidebar is widened again.
                  if (!collapsed) {
                    setToggledGroups((current) => ({ ...current, [node.key]: !open }));
                  }
                  return;
                }
                navigate(node.key);
              }}
            >
              {isActive && <span className="navigate__marker" />}
              <span className="navigate__itemIcon">{ICONS[node.key]}</span>
              {!collapsed && <span className="navigate__itemLabel">{t(node.labelKey)}</span>}
              {!collapsed &&
                isGroup &&
                (open ? (
                  <IconChevronUp className="navigate__itemChevron" />
                ) : (
                  <IconChevronDown className="navigate__itemChevron" />
                ))}
            </button>
          );

          return (
            <Fragment key={node.key}>
              {/* Drawn from the sections in the model rather than from a position in this list, so
                  it stays in the right place for a user who cannot see administration at all. */}
              {startsSection(tree, index) && <div className="navigate__separator" />}

              {/* A rail of unlabelled icons is unusable without something that names them. A group
                  needs no tooltip of its own: its menu is headed by the same name, and two hover
                  layers on one target would fight each other.

                  Whose settings an entry leads to is said on hover rather than printed above it.
                  Standing in the list it was a second label competing with the entry it belonged
                  to, every visit, for an answer that is only wanted once - which is the same thing
                  that was wrong with the band this replaced. Collapsed the label tooltip already
                  owns the hover, and a second layer on one target would fight it. */}
              {!collapsed &&
                (scope == null ? (
                  item
                ) : (
                  <Popover content={<ScopeBadge scope={scope} />} position="right">
                    {item}
                  </Popover>
                ))}
              {collapsed &&
                (isGroup ? (
                  <Popover content={flyout(node)} position="right">
                    {item}
                  </Popover>
                ) : (
                  <Tooltip content={t(node.labelKey)} position="right">
                    {item}
                  </Tooltip>
                ))}

              {isGroup && open && !collapsed && (
                <div className="navigate__children" id={childrenId}>
                  {/* What ties the children to the entry above them. They used to float under it
                      with nothing between the two. */}
                  <span className="navigate__rail" />
                  {node.children.map((child) => {
                    const childIsActive = child.key === activeKey;

                    return (
                      <button
                        key={child.key}
                        type="button"
                        className={`navigate__child${childIsActive ? ' navigate__child--active' : ''}`}
                        aria-current={childIsActive ? 'page' : undefined}
                        onClick={() => navigate(child.key)}
                      >
                        {/* The selection of a child is the rail lighting up beside it, not a second
                            marker of its own. */}
                        <span className="navigate__childRail" />
                        <span className="navigate__childLabel">{t(child.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <span className="navigate__spacer" />

      {/* Whether Fredy is still running, readable from any page instead of only from the
          dashboard. The dot goes amber once the run it promised is in the past, which is the shape
          a stopped scheduler takes: the time never moves again. */}
      {nextRun != null &&
        nextRun !== 0 &&
        (() => {
          const label = t('nav.nextRun', { time: relativeTime(nextRun, t) });
          const dot = (
            <span
              className={`navigate__statusDot${nextRun + STATUS_REFRESH_GRACE_MS <= Date.now() ? ' navigate__statusDot--stale' : ''}`}
            />
          );

          return (
            <div className="navigate__status">
              {/* In the rail the dot is on its own, and a coloured dot with nothing beside it says
                  only that something has a state, not which one. */}
              {collapsed ? (
                <Tooltip content={label} position="right">
                  {dot}
                </Tooltip>
              ) : (
                <>
                  {dot}
                  <span>{label}</span>
                </>
              )}
            </div>
          );
        })()}

      {/* In the rail the toggle sits here, directly over the heart, rather than among the entries
          at the top where it read as a sixth place to go. Expanded it belongs in the header. */}
      {collapsed && (
        <Tooltip content={t('nav.expandSidebar')} position="right">
          {toggle}
        </Tooltip>
      )}

      {/* Shown on the demo instance too. The demo is where most people meet Fredy for the first
          time, so hiding the one place it asks for support removed it from exactly the audience
          that has just seen what the project does. */}
      <div className="navigate__donate">
        <Donate collapsed={collapsed} />
      </div>

      {/* One row where there used to be four controls in four idioms: a ghost button for the news,
          the support button, a permanently red sign-out and a bare toggle icon. */}
      <div className="navigate__account">
        {collapsed ? (
          // The rail has room for one control, so the initials are it. Signing out was reachable
          // from the narrow sidebar before this redesign and has to stay reachable, and a circle
          // with a name in it is the one thing here that already means "you". A menu rather than
          // the power button the wide row carries: the avatar is not a thing you expect to end
          // your session by clicking.
          // No tooltip on top of it: the menu is its own hover layer and already names what it
          // does, and two of them on one target fight each other.
          <Dropdown position="topRight" render={accountMenu}>
            <button type="button" className="navigate__avatar" aria-label={t('nav.accountMenu')}>
              {initial}
            </button>
          </Dropdown>
        ) : (
          <>
            <span className="navigate__avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="navigate__accountText">
              <span className="navigate__accountName">{username}</span>
              <span className="navigate__accountRole">{t(isAdmin ? 'nav.roleAdmin' : 'nav.roleUser')}</span>
            </span>
            {/* Reachable at any time, unlike the dialog that appears on its own: dismissing that
                one used to be the end of it, with no way back to what it had said. */}
            <NewsHistory collapsed={collapsed} />
            {/* The power symbol, doing the one thing the menu behind the three dots ever held. A
                menu with a single item is a click spent on being asked which item. */}
            <button
              type="button"
              className="navigate__accountAction"
              onClick={logout}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
            >
              <IconQuit size="default" />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

Navigation.displayName = 'Navigation';
