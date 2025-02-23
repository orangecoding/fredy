import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { xhrPost } from '../../services/xhr';
import { IconUser } from '@douyinfe/semi-icons';
const Logout = function Logout() {
  return (
    <Button
      icon={<IconUser />}
      type="danger"
      theme="solid"
      onClick={async () => {
        await xhrPost('/api/login/logout');
        location.reload();
      }}
    >
      Logout
    </Button>
  );
};

export default Logout;
