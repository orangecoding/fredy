import React from 'react';
import { useHistory } from 'react-router-dom';
import { Menu } from 'semantic-ui-react';

import './Menu.less';
import { useLocation } from 'react-router';

const TopMenu = function TopMenu({ isAdmin }) {
  const history = useHistory();
  const location = useLocation();

  const isActiveRoute = (name) => location.pathname.indexOf(name) !== -1;

  return (
    <Menu pointing secondary className="topMenu">
      <Menu.Item
        name="jobs"
        active={isActiveRoute('jobs')}
        className={isActiveRoute('jobs') ? 'topMenu__active' : 'topMenu__item'}
        onClick={() => history.push('/jobs')}
      >
        Job Configuration
      </Menu.Item>

      {isAdmin && (
        <Menu.Item
          name="user"
          active={isActiveRoute('users')}
          className={isActiveRoute('users') ? 'topMenu__active' : 'topMenu__item'}
          onClick={() => history.push('/users')}
        >
          User configuration
        </Menu.Item>
      )}
    </Menu>
  );
};

export default TopMenu;
