import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabPane } from '@douyinfe/semi-ui';

import { useLocation } from 'react-router-dom';
import { IconUser, IconTerminal, IconSetting } from '@douyinfe/semi-icons';
import './Menu.less';

function parsePathName(name) {
  const split = name.split('/').filter((s) => s.length !== 0);
  return '/' + split[0];
}

const TopMenu = function TopMenu({ isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Tabs className="menu" type="line" activeKey={parsePathName(location.pathname)} onTabClick={(key) => navigate(key)}>
      <TabPane
        itemKey="/jobs"
        tab={
          <span>
            <IconTerminal />
            Jobs
          </span>
        }
      />

      {isAdmin && (
        <TabPane
          itemKey="/users"
          tab={
            <span>
              <IconUser />
              User
            </span>
          }
        />
      )}

      {isAdmin && (
        <TabPane
          itemKey="/generalSettings"
          tab={
            <span>
              <IconSetting />
              General
            </span>
          }
        />
      )}
    </Tabs>
  );
};

export default TopMenu;
