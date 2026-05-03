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
    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: [
        { itemKey: '/users', text: 'User Management' },
        { itemKey: '/generalSettings', text: 'Settings' },
      ],
    });
  } else {
    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: [{ itemKey: '/generalSettings', text: 'Settings' }],
    });
  }

  function parsePathName(name) {
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
      onSelect={(key) => {
        navigate(key.itemKey);
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
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <IconSidebar size="default" />
          </button>
        </Nav.Footer>
      }
    />
  );
}
