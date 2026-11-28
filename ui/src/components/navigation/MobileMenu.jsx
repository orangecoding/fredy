/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { SideSheet } from '@douyinfe/semi-ui-19';
import { useLocation } from 'react-router';

import heart from '../../assets/heart.png';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { useSelector } from '../../services/state/store.js';
import { relativeTime } from '../../services/time/relativeTime.js';
import Donate from '../donate/Donate.jsx';
import { VersionLine } from '../footer/FredyFooter.jsx';
import { IconBell, IconChevronRight, IconLogout } from '../icons/StrokeIcons.jsx';
import logout from '../logout/Logout.jsx';
import NewsHistory from '../news/NewsHistory.jsx';
import { mobileMenuOf, navTreeFor, resolveActiveKey } from './navModel.js';
import { NAV_ICONS } from './Navigation.jsx';
import { isRunOverdue } from './useNavFigures.js';

import './MobileNav.less';

/** The menu's width, unless the phone is too narrow to leave a strip of the page beside it. */
const SHEET_WIDTH = 320;

/** Below this width the menu takes the whole screen. */
const FULL_WIDTH_BELOW = 360;

/**
 * Whose settings an entry opens, said under its name. The sidebar leaves this to the badge beside
 * each settings heading; in a menu the two entries stand next to each other and only differ by it.
 * @type {Record<string, string>}
 */
const SECTION_HINTS = {
  personal: 'settings.scopeUser',
  instance: 'settings.scopeInstance',
};

/**
 * The phone's menu: whatever the tab bar has no room for, in a sheet over the page.
 *
 * Over it rather than beside it: the sidebar it replaces opened inline and pushed the page into a
 * column too narrow to read. The places come first, then what the sidebar's foot carries on a wide
 * screen - whether the search is running, the release notes, the support dialog, the account and
 * the version line the phone has no footer for.
 *
 * Every place carries the `data-tour` attribute its sidebar entry does, so the onboarding tour finds
 * it once the menu is open.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose Mask, close button and Escape.
 * @param {(path: string) => void} props.onNavigate Opens a place, closing the menu on the way.
 * @param {boolean} props.isAdmin
 * @param {number|null|undefined} props.nextRun Epoch ms of the next search run, see `useRunStatus`.
 * @param {() => void} props.onShowNotes Opens the notes of an available update.
 * @returns {React.ReactElement}
 */
export default function MobileMenu({ open, onClose, onNavigate, isAdmin, nextRun, onShowNotes }) {
  const t = useTranslation();
  const location = useLocation();
  const width = useScreenWidth();
  const username = useSelector((state) => state.user.currentUser?.username);

  const tree = navTreeFor(isAdmin);
  const activeKey = resolveActiveKey(tree, location.pathname);
  const initial = (username ?? '').charAt(0).toUpperCase();

  return (
    <SideSheet
      className="mobileMenu"
      title={t('nav.menu')}
      visible={open}
      onCancel={onClose}
      placement="right"
      width={width < FULL_WIDTH_BELOW ? '100%' : SHEET_WIDTH}
      closeOnEsc
    >
      <div className="mobileMenu__body">
        <div className="mobileMenu__heading">{t('nav.morePages')}</div>
        {mobileMenuOf(tree).map((node) => {
          const Icon = NAV_ICONS[node.key];
          const isActive = node.key === activeKey;
          const hint = SECTION_HINTS[node.section];
          return (
            <button
              key={node.key}
              type="button"
              className={`mobileMenu__row${isActive ? ' mobileMenu__row--active' : ''}`}
              data-tour={node.key}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(node.key)}
            >
              <span className="mobileMenu__icon">{Icon && <Icon />}</span>
              <span className="mobileMenu__text">
                <span className="mobileMenu__label">{t(node.labelKey)}</span>
                {hint && <span className="mobileMenu__hint">{t(hint)}</span>}
              </span>
              <IconChevronRight className="mobileMenu__chevron" />
            </button>
          );
        })}

        <div className="mobileMenu__separator" />

        {nextRun != null && nextRun !== 0 && (
          <div className="mobileMenu__status">
            <span className="mobileMenu__icon">
              <span className={`mobileNav__statusDot${isRunOverdue(nextRun) ? ' mobileNav__statusDot--stale' : ''}`} />
            </span>
            <span>{t('nav.nextRun', { time: relativeTime(nextRun, t) })}</span>
          </div>
        )}

        <NewsHistory
          renderTrigger={({ open: openNews, hasUnread }) => (
            <button type="button" className="mobileMenu__row" onClick={openNews}>
              <span className="mobileMenu__icon">
                <IconBell />
              </span>
              <span className="mobileMenu__text">
                <span className="mobileMenu__label">{t('nav.news')}</span>
              </span>
              {hasUnread && <span className="mobileNav__unread" aria-hidden="true" />}
            </button>
          )}
        />

        <Donate
          renderTrigger={({ open: openDonate }) => (
            <button type="button" className="mobileMenu__row" onClick={openDonate}>
              <span className="mobileMenu__icon">
                <img className="mobileMenu__heart" src={heart} alt="" />
              </span>
              <span className="mobileMenu__text">
                <span className="mobileMenu__label">{t('donate.button')}</span>
              </span>
            </button>
          )}
        />

        <span className="mobileMenu__spacer" />

        <div className="mobileMenu__account">
          <span className="mobileMenu__avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="mobileMenu__accountText">
            <span className="mobileMenu__accountName">{username}</span>
            <span className="mobileMenu__accountRole">{t(isAdmin ? 'nav.roleAdmin' : 'nav.roleUser')}</span>
          </span>
          <button
            type="button"
            className="mobileMenu__logout"
            onClick={logout}
            aria-label={t('nav.logout')}
            title={t('nav.logout')}
          >
            <IconLogout />
          </button>
        </div>

        <div className="mobileMenu__version">
          <VersionLine onShowNotes={onShowNotes} />
        </div>
      </div>
    </SideSheet>
  );
}

MobileMenu.displayName = 'MobileMenu';
