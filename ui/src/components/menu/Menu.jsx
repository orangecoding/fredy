import React from 'react';
import { useHistory } from 'react-router-dom';
import { Tabs, TabPane } from '@douyinfe/semi-ui';

import { useLocation } from 'react-router';
import { IconUser, IconTerminal, IconSetting } from '@douyinfe/semi-icons';

function parsePathName(name) {
  const split = name.split('/').filter((s) => s.length !== 0);
  return '/' + split[0];
}

const TopMenu = function TopMenu({ isAdmin }) {
  const history = useHistory();
  const location = useLocation();
  return (
    <Tabs type="line" activeKey={parsePathName(location.pathname)} onTabClick={(key) => history.push(key)}>
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
