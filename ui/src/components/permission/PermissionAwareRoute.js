import React from 'react';

import { Redirect } from 'react-router-dom';
import { Route } from 'react-router';

export default function PermissionAwareRoute({ currentUser, name, path, component }) {
  /**
   * Checks if given component should be rendered if current user has given permission enabled. If that's not the case,
   * user is redirected to '/403'.
   *
   * @param permission
   * @param component
   * @param path
   * @returns {*}
   */
  const checkIfAdmin = (component, path) => {
    return currentUser != null && currentUser.isAdmin ? component : <Redirect from={path} to="/403" />;
  };

  return <Route name={name} path={path} render={() => checkIfAdmin(component, path)} />;
}
