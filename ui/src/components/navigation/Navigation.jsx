/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect, useState } from 'react';
import { Button, Nav } from '@douyinfe/semi-ui-19';
import { IconStar, IconSetting, IconTerminal, IconHistogram, IconSidebar } from '@douyinfe/semi-icons';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import Logout from '../logout/Logout.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';

export default function Navigation({ isAdmin }) {
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
    { itemKey: '/dashboard', text: 'Dashboard', icon: <IconHistogram /> },
    { itemKey: '/jobs', text: 'Jobs', icon: <IconTerminal /> },
    {
      itemKey: 'listings',
      text: 'Listings',
      icon: <IconStar />,
      items: [
        { itemKey: '/listings', text: 'Overview' },
        { itemKey: '/map', text: 'Map View' },
      ],
    },
  ];

  if (isAdmin) {
    const settingsItems = [
      { itemKey: '/users', text: 'User Management' },
      { itemKey: '/userSettings', text: 'User Specific Settings' },
      { itemKey: '/generalSettings', text: 'General Settings' },
    ];

    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: settingsItems,
    });
  } else {
    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: [{ itemKey: '/userSettings', text: 'User Specific Settings' }],
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
