import React from 'react';
import { Header } from 'semantic-ui-react';
import insufficientPermission from '../../assets/insufficient_permission.png';

export default function InsufficientPermission() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <img src={insufficientPermission} height={250} />
      <br />
      <Header as="h4" inverted>
        Insufficient permission :(
      </Header>
    </div>
  );
}
