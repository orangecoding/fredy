// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useHistory } from 'react-router-dom';
import { Tabs, TabPane } from '@douyinfe/semi-ui';

// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { useLocation } from 'react-router';
import { IconUser, IconTerminal, IconSetting } from '@douyinfe/semi-icons';

function parsePathName(name: any) {
  const split = name.split('/').filter((s: any) => s.length !== 0);
  return '/' + split[0];
}

const TopMenu = function TopMenu({
  isAdmin
}: any) {
  const history = useHistory();
  const location = useLocation();
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Tabs type="line" activeKey={parsePathName(location.pathname)} onTabClick={(key) => history.push(key)}>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <TabPane
        itemKey="/jobs"
        tab={
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          <span>
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <IconTerminal />
            Jobs
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          </span>
        }
      />

      {isAdmin && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <TabPane
          itemKey="/users"
          tab={
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <span>
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <IconUser />
              User
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            </span>
          }
        />
      )}

      {isAdmin && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <TabPane
          itemKey="/generalSettings"
          tab={
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <span>
              // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
              <IconSetting />
              General
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            </span>
          }
        />
      )}
    </Tabs>
  );
};

export default TopMenu;
