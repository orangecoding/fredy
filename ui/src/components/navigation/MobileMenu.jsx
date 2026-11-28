/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { SideSheet } from '@douyinfe/semi-ui-19';
import { useLocation, useNavigate } from 'react-router';

import logout from '../logout/Logout.jsx';
import Donate from '../donate/Donate.jsx';
import NewsHistory from '../news/NewsHistory.jsx';
import FredyFooter from '../footer/FredyFooter.jsx';
import { IconLogout } from '../icons/StrokeIcons.jsx';
import { useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { relativeTime } from '../../services/time/relativeTime.js';
import { NAV_ICONS } from './navIcons.js';
import { mobileMenuFor, resolveActiveKey, startsSection } from './navModel.js';

import './Navigate.less';
import './MobileNav.less';

/** The key in the history entry's state that says the menu is open on it. */
const MENU_STATE = 'fredyMenu';

/**
 * Whether the phone's menu is open, and the ways to change that.
 *
 * Kept in the history entry rather than in component state, so the browser's back button - and the
 * back gesture of a home-screen app - closes the menu instead of leaving the page underneath:
 * opening pushes an entry for the same address that carries a flag, closing goes back over it, and
 * an entry picked in the menu replaces it, so going back from that page lands on the one the menu
 * was opened over.
 *
 * @returns {{isOpen: boolean, open: () => void, close: () => void, go: (to: string) => void}}
 */
export function useMobileMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOpen = location.state?.[MENU_STATE] === true;
  const here = location.pathname + location.search + location.hash;

  return {
    isOpen,
    open: () => {
      if (!isOpen) {
        navigate(here, { state: { ...(location.state ?? {}), [MENU_STATE]: true } });
      }
    },
    close: () => {
      if (isOpen) {
        navigate(-1);
      }
    },
    go: (to) => navigate(to, { replace: isOpen }),
  };
}

/**
 * The phone's menu: everything that is not a tab, opened over the page from the right.
 *
 * It never pushes the content aside - that is what the sidebar did on a phone, squeezing the page
 * into the width that was left. Top to bottom: the entries that are not tabs (from `mobileMenuFor`,
 * so the sidebar's order and its admin rule hold), whether Fredy is running, news and support, who is
 * signed in, and the version line that is the footer on a wide screen.
 *
 * The rows reuse the sidebar's classes: the same rows in the same colours, only in a sheet.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin
 * @param {{isOpen: boolean, close: () => void, go: (to: string) => void}} props.menu From
 *   `useMobileMenu`, owned by the app bar whose button opens it.
 * @param {{nextRun: number|null, stale: boolean}} props.status From `useNavStatus`.
 * @returns {React.ReactElement}
 */
export default function MobileMenu({ isAdmin, menu, status }) {
  const t = useTranslation();
  const location = useLocation();
  const username = useSelector((state) => state.user.currentUser?.username);

  const entries = mobileMenuFor(isAdmin);
  const activeKey = resolveActiveKey(entries, location.pathname);
  const initial = (username ?? '').charAt(0).toUpperCase();

  return (
    <SideSheet
      className="mobileMenu"
      visible={menu.isOpen}
      onCancel={menu.close}
      placement="right"
      // Full width on the smallest phones, where 320px would leave a strip of page too narrow to
      // read as "the page is still there".
      width="min(320px, 100vw)"
      closeOnEsc
      title={null}
      headerStyle={{ display: 'none' }}
      bodyStyle={{ padding: 0 }}
    >
      <nav className="navigate mobileMenu__nav" aria-label={t('nav.menu')}>
        <div className="navigate__list">
          {entries.map((node, index) => {
            const Icon = NAV_ICONS[node.key];
            const isActive = node.key === activeKey;
            return (
              <div key={node.key}>
                {startsSection(entries, index) && entries[index - 1].section === 'work' && (
                  <div className="navigate__separator" />
                )}
                <button
                  type="button"
                  className={`navigate__item${isActive ? ' navigate__item--active' : ''}`}
                  data-tour={node.key}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => menu.go(node.key)}
                >
                  <span className="navigate__itemIcon">{Icon && <Icon />}</span>
                  <span className="navigate__itemLabel">{t(node.labelKey)}</span>
                  {node.section !== 'work' && (
                    <span className="mobileMenu__scope">
                      {t(node.section === 'instance' ? 'settings.scopeInstance' : 'settings.scopeUser')}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="navigate__separator" />

        <div className="navigate__footer">
          {status.nextRun != null && (
            <div className="navigate__status">
              <span className={`navigate__statusDot${status.stale ? ' navigate__statusDot--stale' : ''}`} />
              <span>{t('nav.nextRun', { time: relativeTime(status.nextRun, t) })}</span>
            </div>
          )}
          <NewsHistory collapsed={false} />
          <Donate collapsed={false} />

          <div className="navigate__account">
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
          </div>
        </div>

        <FredyFooter variant="menu" />
      </nav>
    </SideSheet>
  );
}

MobileMenu.displayName = 'MobileMenu';
