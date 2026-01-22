/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';

import { Navigate } from 'react-router-dom';

export default function PermissionAwareRoute({ currentUser, children }) {
  const isAdmin = currentUser != null && currentUser.isAdmin;
  return isAdmin ? children : <Navigate to="/403" replace />;
}
