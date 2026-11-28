/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useLocation, useNavigate } from 'react-router';

import { useTranslation } from '../../services/i18n/i18n.jsx';
import { mobileTabsOf, navTreeFor, resolveActiveKey } from './navModel.js';
import { NAV_ICONS } from './Navigation.jsx';
import { useNavCounts } from './useNavFigures.js';

import './MobileNav.less';

/**
 * The phone's tab bar: the four places people open daily, along the bottom edge, one tap away.
 *
 * The same rule for the current entry as the sidebar's (`resolveActiveKey`), so a listing's detail
 * page still marks Listings, and the same signal: a filled pill in the text colour, nothing red.
 * Each entry carries the `data-tour` attribute the sidebar's entry carries, which is what the
 * onboarding tour points at.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin
 * @returns {React.ReactElement}
 */
export default function MobileTabBar({ isAdmin }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const counts = useNavCounts();

  const tree = navTreeFor(isAdmin);
  const activeKey = resolveActiveKey(tree, location.pathname);

  return (
    <nav className="mobileTabs" aria-label={t('nav.landmark')}>
      {mobileTabsOf(tree).map((node) => {
        const Icon = NAV_ICONS[node.key];
        const isActive = node.key === activeKey;
        const count = counts[node.key];
        return (
          <button
            key={node.key}
            type="button"
            className={`mobileTabs__item${isActive ? ' mobileTabs__item--active' : ''}`}
            data-tour={node.key}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => navigate(node.key)}
          >
            <span className="mobileTabs__icon">
              {Icon && <Icon />}
              {count != null && count > 0 && <span className="mobileTabs__count">{count}</span>}
            </span>
            <span className="mobileTabs__label">{t(node.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}

MobileTabBar.displayName = 'MobileTabBar';
