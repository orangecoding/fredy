import React from 'react';
import { Nav } from '@douyinfe/semi-ui';
import { IconStar, IconSetting, IconTerminal } from '@douyinfe/semi-icons';
import logoWhite from '../../assets/logo_white.png';
import Logout from '../logout/Logout.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';

export default function Navigation({ isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();

  const width = useScreenWidth();
  const collapsed = width <= 850;

  const items = [
    { itemKey: '/jobs', text: 'Jobs', icon: <IconTerminal /> },
    { itemKey: '/listings', text: 'Listings', icon: <IconStar /> },
  ];

  if (isAdmin) {
    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: [
        { itemKey: '/users', text: 'User Management' },
        { itemKey: '/listingManagement', text: 'Listing Management' },
        { itemKey: '/generalSettings', text: 'General Settings' },
      ],
    });
  }

  function parsePathName(name) {
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + split[0];
  }

  return (
    <Nav
      style={{ height: '100%', width: collapsed ? '' : '13.2rem' }}
      items={items}
      isCollapsed={collapsed}
      selectedKeys={[parsePathName(location.pathname)]}
      onSelect={(key) => {
        navigate(key.itemKey);
      }}
      header={<img src={logoWhite} width="180" alt="Fredy Logo" />}
      footer={
        <div className="navigate__logout_Button">
          <Logout text={!collapsed} />
        </div>
      }
    />
  );
}
