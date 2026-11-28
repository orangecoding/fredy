/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useTranslation } from '../../services/i18n/i18n.jsx';
import { useSelector } from '../../services/state/store.js';
import { relativeTime } from '../../services/time/relativeTime.js';
import { IconArrowLeft, IconBell, IconMenu, IconSliders } from '../icons/StrokeIcons.jsx';
import NewsHistory from '../news/NewsHistory.jsx';
import UpdateToast from '../version/UpdateToast.jsx';
import VersionModal from '../version/VersionModal.jsx';
import MobileMenu from './MobileMenu.jsx';
import { navTreeFor, resolveActiveKey, settingsListOf } from './navModel.js';
import { Brand } from './Navigation.jsx';
import { isRunOverdue, useRunStatus } from './useNavFigures.js';

import './MobileNav.less';

/**
 * The phone's app bar: the brand, whether the search is running, the release notes, the settings
 * and the menu. On a settings page the brand gives way to the way back to the settings list.
 *
 * It stands in for the sidebar and the footer, so it also does what those two do besides drawing
 * themselves: it keeps the run status fresh (`useRunStatus`), and it mounts the toast announcing an
 * update together with the release notes the toast and the menu's version line open.
 *
 * The menu's open state is kept in the history entry rather than in component state. Opening it
 * pushes the current location once more, marked as having the menu open, so the browser's back
 * button closes it the way a phone user expects. Closing it any other way steps back over that
 * entry, and choosing a place replaces it, so going back from that place lands where the menu was
 * opened rather than on the menu again.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin
 * @returns {React.ReactElement}
 */
export default function MobileAppBar({ isAdmin }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const nextRun = useRunStatus();
  const hasUpdate = useSelector((state) => Boolean(state.versionUpdate.versionUpdate?.newVersion));
  const [notesVisible, setNotesVisible] = useState(false);

  const menuOpen = location.state?.mobileMenu === true;
  const activeKey = resolveActiveKey(navTreeFor(isAdmin), location.pathname);
  const inSettings = activeKey === '/settings' || activeKey === '/admin';
  const backTo = settingsListOf(location.pathname);

  const openMenu = () =>
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { ...location.state, mobileMenu: true } },
    );

  // Only while this entry is the one that opened the menu. The sheet keeps its mask up while it
  // animates shut, and a tap on it then, or a second Escape, would otherwise step back a whole page.
  // The initial entry of a session has nothing before it to step back to.
  const closeMenu = () => {
    if (!menuOpen) {
      return;
    }
    if (location.key === 'default') {
      const { mobileMenu: _open, ...state } = location.state ?? {};
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state });
    } else {
      navigate(-1);
    }
  };

  const showNotes = () => setNotesVisible(true);

  const status =
    nextRun != null && nextRun !== 0
      ? (() => {
          const label = t('nav.nextRun', { time: relativeTime(nextRun, t) });
          return (
            <span className="mobileBar__status" role="img" aria-label={label} title={label}>
              <span className={`mobileNav__statusDot${isRunOverdue(nextRun) ? ' mobileNav__statusDot--stale' : ''}`} />
              <span className="mobileBar__statusText" aria-hidden="true">
                {relativeTime(nextRun, t)}
              </span>
            </span>
          );
        })()
      : null;

  return (
    <>
      <header className="mobileBar">
        {backTo != null ? (
          <button type="button" className="mobileBar__back" onClick={() => navigate(backTo)}>
            <IconArrowLeft />
            <span>{t('nav.settings')}</span>
          </button>
        ) : (
          <span className="mobileBar__brand">
            <Brand collapsed={false} />
          </span>
        )}

        <span className="mobileBar__spacer" />

        {status}

        <NewsHistory
          renderTrigger={({ open, hasUnread }) => (
            <button type="button" className="mobileBar__action" onClick={open} aria-label={t('nav.news')}>
              <IconBell />
              {hasUnread && <span className="mobileNav__unread mobileBar__unread" aria-hidden="true" />}
            </button>
          )}
        />

        <button
          type="button"
          className={`mobileBar__action${inSettings ? ' mobileBar__action--active' : ''}`}
          data-tour="/settings"
          aria-label={t('nav.settings')}
          aria-current={inSettings ? 'page' : undefined}
          onClick={() => navigate('/settings')}
        >
          <IconSliders />
        </button>

        <button
          type="button"
          className="mobileBar__action"
          data-tour="menu"
          aria-label={t('nav.openMenu')}
          aria-expanded={menuOpen}
          onClick={openMenu}
        >
          <IconMenu />
        </button>
      </header>

      <MobileMenu
        open={menuOpen}
        onClose={closeMenu}
        onNavigate={(path) => navigate(path, { replace: true })}
        isAdmin={isAdmin}
        nextRun={nextRun}
        onShowNotes={showNotes}
      />

      {hasUpdate && <VersionModal visible={notesVisible} onClose={() => setNotesVisible(false)} />}
      {hasUpdate && <UpdateToast onShowNotes={showNotes} />}
    </>
  );
}

MobileAppBar.displayName = 'MobileAppBar';
