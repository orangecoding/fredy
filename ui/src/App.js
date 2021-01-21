import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import ToastsContainer from './components/toasts/ToastContainer';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import ToastContext from './components/toasts/ToastContext';
import JobInsight from './views/jobs/insights/JobInsight';
import { useDispatch, useSelector } from 'react-redux';
import useToast from './components/toasts/useToast';
import { Switch, Redirect } from 'react-router-dom';
import Logout from './components/logout/Logout';
import Logo from './components/logo/Logo';
import Menu from './components/menu/Menu';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';
import { Route } from 'react-router';

import './App.less';

export default function FredyApp() {
  const dispatch = useDispatch();
  const [showToast, onToastFinished, toasts] = useToast();
  const [loading, setLoading] = React.useState(true);
  const currentUser = useSelector((state) => state.user.currentUser);

  useEffect(async () => {
    await dispatch.provider.getProvider();
    await dispatch.jobs.getJobs();
    await dispatch.notificationAdapter.getAdapter();
    await dispatch.user.getCurrentUser();

    setLoading(false);
  }, [currentUser?.userId]);

  const needsLogin = () => {
    return currentUser == null || Object.keys(currentUser).length === 0;
  };

  const isAdmin = () => currentUser != null && currentUser.isAdmin;

  const login = () => (
    <Switch>
      <Route name="Login" path={'/login'} component={Login} />
      <Redirect from="*" to={'/login'} />
    </Switch>
  );

  return loading ? null : needsLogin() ? (
    login()
  ) : (
    <ToastContext.Provider value={{ showToast }}>
      <div className="app">
        <div className="app__container">
          <Logout />
          <Logo width={190} white />
          <Menu isAdmin={isAdmin()} />
          <ToastsContainer toasts={toasts} onToastFinished={onToastFinished} />
          <Switch>
            <Route name="Insufficient Permission" path={'/403'} component={InsufficientPermission} />
            <Route name="Create new Job" path={'/jobs/new'} component={JobMutation} />
            <Route name="Edit a Job" path={'/jobs/edit/:jobId'} component={JobMutation} />
            <Route name="Insights into a Job" path={'/jobs/insights/:jobId'} component={JobInsight} />
            <Route name="Job overview" path={'/jobs'} component={Jobs} />
            <PermissionAwareRoute
              name="Create new User"
              path="/users/new"
              component={<UserMutator />}
              currentUser={currentUser}
            />
            <PermissionAwareRoute
              name="Edit a user"
              path="/users/edit/:userId"
              component={<UserMutator />}
              currentUser={currentUser}
            />
            <PermissionAwareRoute name="Users" path="/users" component={<Users />} currentUser={currentUser} />

            <Redirect from="/" to={'/jobs'} />
          </Switch>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

FredyApp.displayName = 'FredyApp';
