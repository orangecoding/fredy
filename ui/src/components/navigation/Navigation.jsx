/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Fragment, useEffect, useState } from 'react';
import { Dropdown, Tooltip } from '@douyinfe/semi-ui-19';
import logo from '../../assets/logo.png';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import logout from '../logout/Logout.jsx';
import Donate from '../donate/Donate.jsx';
import NewsHistory from '../news/NewsHistory.jsx';
import {
  IconAdmin,
  IconFinance,
  IconListings,
  IconLogout,
  IconMap,
  IconOverview,
  IconSearches,
  IconSidebar,
  IconSliders,
} from '../icons/StrokeIcons.jsx';
import { useLocation, useNavigate } from 'react-router';
import { normalizeTheme } from '../../services/theme/theme.js';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useActions, useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
// A pure function that already answers exactly this question for the dashboard's own rows. A copy
// here would be a second set of rounding rules for the same clock.
import { relativeTime } from '../../services/time/relativeTime.js';
import { navTreeFor, resolveActiveKey, startsSection } from './navModel.js';

/** How long after a promised run the status is asked for again: the run itself takes a moment. */
const STATUS_REFRESH_GRACE_MS = 60 * 1000;

/** `setTimeout` overflows past about 24.8 days and would fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * The icon each entry carries. Keyed by nav key so the tree itself stays free of JSX.
 * @type {Record<string, React.ComponentType>}
 */
const ICONS = {
  '/dashboard': IconOverview,
  '/listings': IconListings,
  '/map': IconMap,
  '/jobs': IconSearches,
  '/finance': IconFinance,
  '/settings': IconSliders,
  '/admin': IconAdmin,
};

/**
 * The brand: the wordmark when there is room for it, the heart alone when there is not.
 *
 * A bitmap with two cuts rather than a path, because this is the logo the project is known by and
 * no custom property can recolour a PNG into it. Sized by height, because the wordmark is two and a
 * half times as wide as it is tall.
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
 * The sidebar: the places this instance has, which of them the current URL is in, whether the
 * search is running, and the session the user is in it as.
 *
 * Every place sits at the top level and is one click away. The current entry is shown by a filled
 * row in the text colour; nothing in the sidebar is red, because red is kept for the one action a
 * page is about. `navModel.js` decides what is in it and which entry a nested route counts as; this
 * file decides how that looks.
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

  useEffect(() => {
    if (width <= 850) {
      setCollapsed(true);
    }
  }, [width]);

  // Whose session this is. Already in the store from the call App makes before it renders anything,
  // so the sidebar asks nothing of its own.
  const username = useSelector((state) => state.user.currentUser?.username);

  // The counts beside two entries. The jobs App fetches before the first render; the active listings
  // come with the overview's figures, which the sidebar asks for itself (below) when someone lands
  // on another page first. Until they are in, the listings entry shows no number rather than a guess.
  const jobCount = useSelector((state) => state.jobsData.jobs?.length ?? null);
  const listingCount = useSelector((state) => state.dashboard.data?.kpis?.numberOfActiveListings ?? null);
  const counts = { '/jobs': jobCount, '/listings': listingCount };

  // The next run, from the same answer. Until it is in, the row is simply not drawn - no
  // placeholder, no dash, nothing that pretends to know. Once there is one, the sidebar asks again
  // when it falls due (below).
  const nextRun = useSelector((state) => state.dashboard.data?.general?.nextRun);
  const actions = useActions();

  // Landing on any page but the overview left the count and the status out until the overview had
  // been opened once, so the sidebar looked different depending on where the session began. Asked
  // once per mount - the sidebar mounts again after every sign-in, so a figure left in the store by
  // the previous session is replaced - and not on the overview, which asks for the same answer.
  useEffect(() => {
    if (!location.pathname.startsWith('/dashboard')) actions.dashboard.getDashboard();
  }, []);

  // That answer goes stale the moment the promised run comes round, and nothing else refreshes it
  // away from the dashboard. Asked again once the run is due, plus a minute for the run itself:
  // amber then means a fresh answer still points into the past.
  useEffect(() => {
    if (nextRun == null || nextRun === 0) return undefined;
    const delay = Math.min(Math.max(0, nextRun - Date.now()) + STATUS_REFRESH_GRACE_MS, MAX_TIMER_MS);
    const timer = setTimeout(() => actions.dashboard.getDashboard(), delay);
    return () => clearTimeout(timer);
  }, [nextRun]);

  const tree = navTreeFor(isAdmin);
  const activeKey = resolveActiveKey(tree, location.pathname);

  const toggle = (
    <button
      type="button"
      className="navigate__toggle"
      onClick={() => setCollapsed(!collapsed)}
      aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
    >
      <IconSidebar />
    </button>
  );

  const accountMenu = (
    <Dropdown.Menu>
      <Dropdown.Item onClick={logout}>{t('nav.logout')}</Dropdown.Item>
    </Dropdown.Menu>
  );

  const initial = (username ?? '').charAt(0).toUpperCase();

  const statusRow =
    nextRun != null && nextRun !== 0
      ? (() => {
          const label = t('nav.nextRun', { time: relativeTime(nextRun, t) });
          const dot = (
            <span
              className={`navigate__statusDot${nextRun + STATUS_REFRESH_GRACE_MS <= Date.now() ? ' navigate__statusDot--stale' : ''}`}
            />
          );
          // In the rail the dot is on its own, and a coloured dot with nothing beside it says only
          // that something has a state, not which one.
          return (
            <div className="navigate__status">
              {collapsed ? (
                <Tooltip content={label} position="right">
                  {dot}
                </Tooltip>
              ) : (
                <>
                  {dot}
                  <span title={label}>{label}</span>
                </>
              )}
            </div>
          );
        })()
      : null;

  return (
    <nav className={`navigate${collapsed ? ' navigate--collapsed' : ''}`} aria-label={t('nav.landmark')}>
      <div className="navigate__header">
        <Brand collapsed={collapsed} />
        {!collapsed && toggle}
      </div>

      <div className="navigate__list">
        {tree.map((node, index) => {
          const Icon = ICONS[node.key];
          const isActive = node.key === activeKey;
          const count = counts[node.key];

          const item = (
            <button
              type="button"
              className={`navigate__item${isActive ? ' navigate__item--active' : ''}`}
              // What the onboarding tour points at when it asks for a click here.
              data-tour={node.key}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => navigate(node.key)}
            >
              <span className="navigate__itemIcon">{Icon && <Icon />}</span>
              {!collapsed && <span className="navigate__itemLabel">{t(node.labelKey)}</span>}
              {!collapsed && count != null && <span className="navigate__itemCount">{count}</span>}
            </button>
          );

          return (
            <Fragment key={node.key}>
              {/* One rule, between the daily work and what is configured: settings and the
                  administration below it are one half of the sidebar, not two. */}
              {startsSection(tree, index) && tree[index - 1].section === 'work' && (
                <div className="navigate__separator" />
              )}

              {collapsed ? (
                <Tooltip content={t(node.labelKey)} position="right">
                  {item}
                </Tooltip>
              ) : (
                item
              )}
            </Fragment>
          );
        })}
      </div>

      <span className="navigate__spacer" />

      <div className="navigate__footer">
        {/* Whether Fredy is still running, readable from any page instead of only from the
            dashboard. The dot goes amber once the run it promised is in the past, which is the
            shape a stopped scheduler takes: the time never moves again. */}
        {statusRow}

        <NewsHistory collapsed={collapsed} />

        {/* Shown on the demo instance too. The demo is where most people meet Fredy for the first
            time, so hiding the one place it asks for support removed it from exactly the audience
            that has just seen what the project does. */}
        <Donate collapsed={collapsed} />

        {/* In the rail the toggle sits here, directly over the account, rather than among the
            entries at the top where it read as another place to go. */}
        {collapsed && (
          <Tooltip content={t('nav.expandSidebar')} position="right">
            {toggle}
          </Tooltip>
        )}

        <div className="navigate__account">
          {collapsed ? (
            // The rail has room for one control, so the initial is it, and signing out stays
            // reachable through its menu.
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
              <button
                type="button"
                className="navigate__accountAction"
                onClick={logout}
                aria-label={t('nav.logout')}
                title={t('nav.logout')}
              >
                <IconLogout />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

Navigation.displayName = 'Navigation';
