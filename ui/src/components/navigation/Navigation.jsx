/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Nav } from '@douyinfe/semi-ui-19';
import {
  IconStar,
  IconSetting,
  IconTerminal,
  IconHistogram,
  IconSidebar,
  IconServerStroked,
} from '@douyinfe/semi-icons';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import Logout from '../logout/Logout.jsx';
import Donate from '../donate/Donate.jsx';
import NewsHistory from '../news/NewsHistory.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { useSelector } from '../../services/state/store';
import { navTreeFor, resolveActiveKey } from './navModel.js';

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

export default function Navigation({ isAdmin }) {
  const t = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // The demo instance is a showcase, not an installation someone maintains - asking its
  // visitors for money would be begging on someone else's behalf.
  const settings = useSelector((state) => state.generalSettings.settings);

  const width = useScreenWidth();
  const [collapsed, setCollapsed] = useState(width <= 850);

  useEffect(() => {
    if (width <= 850) {
      setCollapsed(true);
    }
  }, [width]);

  const tree = navTreeFor(isAdmin);

  /**
   * The tree in the shape Semi's `<Nav>` wants: translated labels, icons attached, groups nested.
   *
   * @param {import('./navModel.js').NavNode[]} nodes
   * @returns {Object[]}
   */
  const toNavItems = (nodes) =>
    nodes.map((node) => ({
      itemKey: node.key,
      text: t(node.labelKey),
      // Only top-level entries carry an icon. Sub-items are read as a list under the one they
      // belong to, and a single marked entry among unmarked siblings reads as a different kind of
      // thing rather than as one of them.
      icon: ICONS[node.key],
      ...(node.children ? { items: toNavItems(node.children) } : {}),
    }));

  const sidebarWidth = collapsed ? '60px' : '220px';

  return (
    <Nav
      style={{ height: '100%', width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
      items={toNavItems(tree)}
      isCollapsed={collapsed}
      selectedKeys={[resolveActiveKey(tree, location.pathname)]}
      onClick={({ itemKey }) => {
        // Use onClick (fires on every click) instead of onSelect (skips the
        // already-selected item) so clicking e.g. "Jobs" while on a nested
        // route like /jobs/edit/:id still navigates back to the list. Only
        // leaf routes navigate; parent items (keys without a leading '/') just
        // toggle their submenu.
        if (typeof itemKey === 'string' && itemKey.startsWith('/')) {
          navigate(itemKey);
        }
      }}
      header={
        <div className="navigate__header">
          <img src={collapsed ? heart : logoWhite} width={collapsed ? 30 : 160} alt="Fredy Logo" />
        </div>
      }
      footer={
        <Nav.Footer className="navigate__footer">
          {/* Reachable at any time, unlike the dialog that appears on its own: dismissing that one
              used to be the end of it, with no way back to what it had said. */}
          <div className="navigate__footer-news">
            <NewsHistory collapsed={collapsed} />
          </div>
          {!settings.demoMode && (
            <div className="navigate__footer-donate">
              <Donate collapsed={collapsed} />
            </div>
          )}
          <div className={`navigate__footer-actions${collapsed ? ' navigate__footer-actions--collapsed' : ''}`}>
            <Logout text={!collapsed} />
            <button
              className="navigate__toggle-btn"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            >
              <IconSidebar size="default" />
            </button>
          </div>
        </Nav.Footer>
      }
    />
  );
}
