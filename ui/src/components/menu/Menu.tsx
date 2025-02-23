import React from 'react';
import { useHistory } from 'react-router-dom';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useLocation } from 'react-router';
import { IconUser, IconTerminal, IconSetting } from '@douyinfe/semi-icons';

interface TopMenuProps {
  isAdmin: boolean;
}

function parsePathName(name: string): string {
  const split = name.split('/').filter((s: string) => s.length !== 0);
  return '/' + split[0];
}

const TopMenu: React.FC<TopMenuProps> = ({ isAdmin }) => {
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
