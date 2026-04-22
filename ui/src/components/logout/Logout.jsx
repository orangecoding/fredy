/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrPost } from '../../services/xhr';
import { IconUser } from '@douyinfe/semi-icons';

const Logout = function Logout({ text }) {
  const handleLogout = async () => {
    await xhrPost('/api/login/logout');
    location.reload();
  };

  return (
    <button className={`navigate__logout-btn${!text ? ' navigate__logout-btn--icon-only' : ''}`} onClick={handleLogout}>
      <IconUser size="default" />
      {text && 'Logout'}
    </button>
  );
};

export default Logout;
