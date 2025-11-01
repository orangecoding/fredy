import React from 'react';
import { Nav } from '@douyinfe/semi-ui';
import { IconUser, IconStar, IconSetting, IconTerminal } from '@douyinfe/semi-icons';
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
    { itemKey: '/listings', text: 'Found Listings', icon: <IconStar /> },
  ];

  if (isAdmin) {
    items.push({ itemKey: '/users', text: 'User Management', icon: <IconUser /> });
    items.push({ itemKey: '/generalSettings', text: 'General Settings', icon: <IconSetting /> });
  }

  function parsePathName(name) {
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + split[0];
  }

  return (
    <Nav
      style={{ height: '100%', width: collapsed ? '' : '13rem' }}
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
