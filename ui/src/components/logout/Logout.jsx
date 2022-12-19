import React from 'react';
import { Button } from 'semantic-ui-react';
import { xhrPost } from '../../services/xhr';

const Logout = function Logout() {
  return (
    <Button
      content="Logout"
      labelPosition="left"
      icon="user"
      size="mini"
      onClick={async () => {
        await xhrPost('/api/login/logout');
        location.reload();
      }}
      negative
    />
  );
};

export default Logout;
