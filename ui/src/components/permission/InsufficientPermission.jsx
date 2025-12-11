/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import insufficientPermission from '../../assets/insufficient_permission.png';

export default function InsufficientPermission() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <img src={insufficientPermission} height={250} />
      <br />
      <h4>Insufficient permission :(</h4>
    </div>
  );
}
