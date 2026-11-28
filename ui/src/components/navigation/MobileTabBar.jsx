/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useLocation, useNavigate } from 'react-router';

import { useTranslation } from '../../services/i18n/i18n.jsx';
import { NAV_ICONS } from './navIcons.js';
import { mobileTabsFor, resolveActiveKey } from './navModel.js';

import './MobileNav.less';

/**
 * The tab bar along the bottom of a phone screen: the four places used every day.
 *
 * Which four is `navModel.js`'s decision (`mobileTabsFor`); this file only draws them. The current
 * tab is marked the way the sidebar marks its entry - a filled pill in the text colour, never red -
 * and the same `resolveActiveKey` decides it, so `/listings/listing/42` still lights up Listings.
 *
 * A flex child of the shell below the scrolling content, not `position: fixed`, so nothing in the
 * content can slide under it: the settings' sticky save bar stops above it on its own. Its height is
 * published as `--tabbar-height` (MobileNav.less) for what is fixed to the viewport instead, the
 * listing detail's action bar.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin
 * @param {Record<string, number|null>} props.counts Small numbers on the tabs, keyed by nav key.
 * @returns {React.ReactElement}
 */
export default function MobileTabBar({ isAdmin, counts }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = mobileTabsFor(isAdmin);
  const activeKey = resolveActiveKey(tabs, location.pathname);

  return (
    <nav className="mobileTabBar" aria-label={t('nav.landmark')}>
      {tabs.map((node) => {
        const Icon = NAV_ICONS[node.key];
        const isActive = node.key === activeKey;
        const count = counts[node.key];
        return (
          <button
            key={node.key}
            type="button"
            className={`mobileTabBar__tab${isActive ? ' mobileTabBar__tab--active' : ''}`}
            // The onboarding tour points at the same attribute on the sidebar entry; on a phone the
            // tab is the entry.
            data-tour={node.key}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(node.key)}
          >
            <span className="mobileTabBar__icon">
              {Icon && <Icon />}
              {count != null && count > 0 && <span className="mobileTabBar__count">{count}</span>}
            </span>
            <span className="mobileTabBar__label">{t(node.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

MobileTabBar.displayName = 'MobileTabBar';
