/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useState } from 'react';
import { Button, Nav } from '@douyinfe/semi-ui';
import { IconStar, IconSetting, IconTerminal, IconHistogram, IconSidebar } from '@douyinfe/semi-icons';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import Logout from '../logout/Logout.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useFeature } from '../../hooks/featureHook.js';
import { useScreenWidth } from '../../hooks/screenWidth.js';

export default function Navigation({ isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();

  const width = useScreenWidth();
  const [collapsed, setCollapsed] = useState(width <= 850);
  const watchlistFeature = useFeature('WATCHLIST_MANAGEMENT') || false;

  useEffect(() => {
    if (width <= 850) {
      setCollapsed(true);
    }
  }, [width]);

  const items = [
    { itemKey: '/dashboard', text: 'Dashboard', icon: <IconHistogram /> },
    { itemKey: '/jobs', text: 'Jobs', icon: <IconTerminal /> },
    {
      itemKey: 'listings',
      text: 'Listings',
      icon: <IconStar />,
      items: [
        { itemKey: '/listings', text: 'Table' },
        { itemKey: '/map', text: 'Map' },
      ],
    },
  ];

  if (isAdmin) {
    const settingsItems = [
      { itemKey: '/users', text: 'User Management' },
      { itemKey: '/generalSettings', text: 'General Settings' },
    ];
    if (watchlistFeature) {
      settingsItems.push({ itemKey: '/watchlistManagement', text: 'Watchlist Management' });
    }

    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: settingsItems,
    });
  }

  function parsePathName(name) {
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + split[0];
  }

  return (
    <Nav
      style={{ height: '100%' }}
      items={items}
      isCollapsed={collapsed}
      selectedKeys={[parsePathName(location.pathname)]}
      onSelect={(key) => {
        navigate(key.itemKey);
      }}
      header={<img src={collapsed ? heart : logoWhite} width={collapsed ? '80' : '160'} alt="Fredy Logo" />}
      footer={
        <Nav.Footer className="navigate__footer">
          <Logout text={!collapsed} />
          <Button icon={<IconSidebar />} onClick={() => setCollapsed(!collapsed)}>
            {!collapsed && 'Collapse'}
          </Button>
        </Nav.Footer>
      }
    />
  );
}
