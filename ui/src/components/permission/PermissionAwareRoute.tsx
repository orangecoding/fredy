import { User } from '#types/User.ts';
import React from 'react';
import { Redirect, Route, RouteProps, RouteComponentProps } from 'react-router-dom';

interface PermissionAwareRouteProps extends RouteProps {
  currentUser: User | null;
  component: React.ComponentType<RouteComponentProps>;
}

export default function PermissionAwareRoute({
  currentUser,
  component: ComponentToRender,
  ...rest
}: PermissionAwareRouteProps) {
  if (!ComponentToRender) {
    return null;
  }

  return (
    <Route
      {...rest}
      render={(props: RouteComponentProps) =>
        currentUser?.isAdmin ? (
          <ComponentToRender {...props} />
        ) : (
          <Redirect
            to={{
              pathname: '/403',
              state: { from: props.location },
            }}
          />
        )
      }
    />
  );
}
