// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React from 'react';

// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { Redirect } from 'react-router-dom';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { Route } from 'react-router';

export default function PermissionAwareRoute({
  currentUser,
  name,
  path,
  component
}: any) {
  /**
   * Checks if given component should be rendered if current user has given permission enabled. If that's not the case,
   * user is redirected to '/403'.
   *
   * @param permission
   * @param component
   * @param path
   * @returns {*}
   */
  const checkIfAdmin = (component: any, path: any) => {
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    return currentUser != null && currentUser.isAdmin ? component : <Redirect from={path} to="/403" />;
  };

  // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
  return <Route name={name} path={path} render={() => checkIfAdmin(component, path)} />;
}
