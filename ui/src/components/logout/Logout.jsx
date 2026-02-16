/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button } from '@douyinfe/semi-ui-19';
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
