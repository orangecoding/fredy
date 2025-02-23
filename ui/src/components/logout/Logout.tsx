import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { xhrPost } from '#ui_services/xhr';
import { IconUser } from '@douyinfe/semi-icons';

const Logout: React.FC = () => {
  return (
    <Button
      icon={<IconUser />}
      type="danger"
      theme="solid"
      onClick={async () => {
        await xhrPost('/api/login/logout', {});
        window.location.reload();
      }}
    >
      Logout
    </Button>
  );
};

export default Logout;
