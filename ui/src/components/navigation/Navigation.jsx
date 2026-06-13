/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Nav } from '@douyinfe/semi-ui-19';
import { IconStar, IconSetting, IconTerminal, IconHistogram, IconSidebar } from '@douyinfe/semi-icons';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import Logout from '../logout/Logout.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

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

  const items = [
    { itemKey: '/dashboard', text: t('nav.dashboard'), icon: <IconHistogram /> },
    { itemKey: '/jobs', text: t('nav.jobs'), icon: <IconTerminal /> },
    {
      itemKey: 'listings',
      text: t('nav.listings'),
      icon: <IconStar />,
      items: [
        { itemKey: '/listings', text: t('nav.listingsOverview') },
        { itemKey: '/map', text: t('nav.mapView') },
        { itemKey: '/listings/watchlist', text: t('nav.watchlist') },
      ],
    },
  ];

  if (isAdmin) {
    items.push({
      itemKey: 'settings',
      text: t('nav.settings'),
      icon: <IconSetting />,
      items: [
        { itemKey: '/users', text: t('nav.userManagement') },
        { itemKey: '/generalSettings', text: t('nav.settingsPage') },
      ],
    });
  } else {
    items.push({
      itemKey: 'settings',
      text: t('nav.settings'),
      icon: <IconSetting />,
      items: [{ itemKey: '/generalSettings', text: t('nav.settingsPage') }],
    });
  }

  function parsePathName(name) {
    // Collect every leaf itemKey that looks like a route (starts with '/').
    // Prefer the longest exact-prefix match so nested routes like
    // '/listings/watchlist' resolve to themselves instead of being collapsed
    // to '/listings'.
    const allKeys = [];
    const collect = (nodes) => {
      for (const n of nodes) {
        if (typeof n.itemKey === 'string' && n.itemKey.startsWith('/')) allKeys.push(n.itemKey);
        if (Array.isArray(n.items)) collect(n.items);
      }
    };
    collect(items);
    const longestMatch = allKeys
      .filter((k) => name === k || name.startsWith(k + '/'))
      .sort((a, b) => b.length - a.length)[0];
    if (longestMatch) return longestMatch;
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + split[0];
  }

  const sidebarWidth = collapsed ? '60px' : '220px';

  return (
    <Nav
      style={{ height: '100%', width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
      items={items}
      isCollapsed={collapsed}
      selectedKeys={[parsePathName(location.pathname)]}
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
        <Nav.Footer className={`navigate__footer${collapsed ? ' navigate__footer--collapsed' : ''}`}>
          <Logout text={!collapsed} />
          <button
            className="navigate__toggle-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            <IconSidebar size="default" />
          </button>
        </Nav.Footer>
      }
    />
  );
}
