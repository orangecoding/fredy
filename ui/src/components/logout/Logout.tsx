// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { xhrPost } from '../../services/xhr';
import { IconUser } from '@douyinfe/semi-icons';
const Logout = function Logout() {
  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Button
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      icon={<IconUser />}
      type="danger"
      theme="solid"
      onClick={async () => {
        // @ts-expect-error TS(2554): Expected 2-4 arguments, but got 1.
        await xhrPost('/api/login/logout');
        location.reload();
      }}
    >
      Logout
    </Button>
  );
};

export default Logout;
