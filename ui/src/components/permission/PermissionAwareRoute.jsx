import React from 'react';

import { Navigate } from 'react-router-dom';

export default function PermissionAwareRoute({ currentUser, children }) {
  const isAdmin = currentUser != null && currentUser.isAdmin;
  return isAdmin ? children : <Navigate to="/403" replace />;
}
