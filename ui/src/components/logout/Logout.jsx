import React from 'react';
import { Button } from '@douyinfe/semi-ui';
import { xhrPost } from '../../services/xhr';
import { IconUser } from '@douyinfe/semi-icons';

const Logout = function Logout({ text }) {
  return (
    <div>
      <Button
        icon={<IconUser />}
        type="danger"
        theme="solid"
        onClick={async () => {
          await xhrPost('/api/login/logout');
          location.reload();
        }}
      >
        {text && 'Logout'}
      </Button>
    </div>
  );
};

export default Logout;
