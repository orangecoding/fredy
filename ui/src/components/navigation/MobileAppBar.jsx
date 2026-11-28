/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import heart from '../../assets/heart.png';
import NewsHistory from '../news/NewsHistory.jsx';
import { IconArrowLeft, IconBell, IconMenu, IconSliders } from '../icons/StrokeIcons.jsx';
import { locateSettingsPage } from '../settingsShell/settingsPages.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { relativeTime } from '../../services/time/relativeTime.js';
import MobileMenu, { useMobileMenu } from './MobileMenu.jsx';

import './MobileNav.less';

/**
 * The bar along the top of a phone screen.
 *
 * Left: the heart and the name, or - on a settings sub-page, which has no tab strip on a phone - a
 * back arrow to the settings list. Right: whether Fredy is running, the news, the settings and the
 * menu. Everything the sidebar's foot carried that is not here is in the menu.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin
 * @param {{nextRun: number|null, stale: boolean}} props.status From `useNavStatus`.
 * @returns {React.ReactElement}
 */
export default function MobileAppBar({ isAdmin, status }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const menu = useMobileMenu();

  // A reload keeps the history entry's state, so a page reloaded while the menu was open would come
  // back with the menu open over it. Opening it is something a tap does, not a reload.
  useEffect(() => {
    if (menu.isOpen) {
      const { fredyMenu: _ignored, ...rest } = location.state ?? {};
      navigate(location.pathname + location.search + location.hash, { replace: true, state: rest });
    }
  }, []);

  const inSettings = locateSettingsPage(location.pathname);
  // A sub-page leads back to its own area's list: from System that is the list scrolled to the
  // administration, which also keeps the administration's unsaved form, because `/admin` is rendered
  // by the same layout.
  const backTo = inSettings?.page != null ? inSettings.area.root : null;

  const statusLabel = status.nextRun != null ? t('nav.nextRun', { time: relativeTime(status.nextRun, t) }) : null;

  return (
    <header className="mobileAppBar">
      {backTo != null ? (
        <button type="button" className="mobileAppBar__back" onClick={() => navigate(backTo)}>
          <IconArrowLeft aria-hidden="true" />
          <span>{t('nav.settings')}</span>
        </button>
      ) : (
        <button type="button" className="mobileAppBar__brand" onClick={() => navigate('/dashboard')}>
          <img src={heart} alt="" />
          <span>Fredy</span>
        </button>
      )}

      <span className="mobileAppBar__spacer" />

      {/* Compact: the dot and the time. The full sentence is its accessible name and is spelled out
          again in the menu. */}
      {statusLabel != null && (
        <span className="mobileAppBar__status" role="status" aria-label={statusLabel} title={statusLabel}>
          <span className={`navigate__statusDot${status.stale ? ' navigate__statusDot--stale' : ''}`} />
          <span aria-hidden="true">{relativeTime(status.nextRun, t)}</span>
        </span>
      )}

      <NewsHistory
        collapsed={false}
        renderTrigger={({ open, hasUnread }) => (
          <button type="button" className="mobileAppBar__action" onClick={open} aria-label={t('nav.news')}>
            <IconBell aria-hidden="true" />
            {hasUnread && <span className="mobileAppBar__dot" aria-hidden="true" />}
          </button>
        )}
      />

      <button
        type="button"
        className={`mobileAppBar__action${inSettings != null ? ' mobileAppBar__action--active' : ''}`}
        onClick={() => navigate('/settings')}
        aria-label={t('nav.settings')}
        aria-current={inSettings != null ? 'page' : undefined}
        // The onboarding tour's step "open the settings" points here on a phone.
        data-tour="/settings"
      >
        <IconSliders aria-hidden="true" />
      </button>

      <button
        type="button"
        className="mobileAppBar__action"
        onClick={menu.open}
        aria-label={t('nav.menu')}
        aria-expanded={menu.isOpen}
      >
        <IconMenu aria-hidden="true" />
      </button>

      <MobileMenu isAdmin={isAdmin} menu={menu} status={status} />
    </header>
  );
}

MobileAppBar.displayName = 'MobileAppBar';
