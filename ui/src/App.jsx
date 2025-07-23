import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import GeneralSettings from './views/generalSettings/GeneralSettings';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import JobInsight from './views/jobs/insights/JobInsight.jsx';
import { useDispatch, useSelector } from 'react-redux';
import { Switch, Redirect } from 'react-router-dom';
import Logout from './components/logout/Logout';
import Logo from './components/logo/Logo';
import Menu from './components/menu/Menu';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';
import { Route } from 'react-router';

import './App.less';
import TrackingModal from './components/tracking/TrackingModal.jsx';
import { Banner } from '@douyinfe/semi-ui';

export default function FredyApp() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState(true);
  const currentUser = useSelector((state) => state.user.currentUser);
  const settings = useSelector((state) => state.generalSettings.settings);

  useEffect(() => {
    async function init() {
      await dispatch.user.getCurrentUser();
      if (!needsLogin()) {
        await dispatch.provider.getProvider();
        await dispatch.jobs.getJobs();
        await dispatch.jobs.getProcessingTimes();
        await dispatch.notificationAdapter.getAdapter();
        await dispatch.generalSettings.getGeneralSettings();
      }
      setLoading(false);
    }

    init();
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
    <div className="app">
      <div className="app__container">
        <Logout />
        <Logo width={190} white />
        <Menu isAdmin={isAdmin()} />

        {settings.demoMode && (
          <>
            <Banner
              fullMode={true}
              type="info"
              bordered
              closeIcon={null}
              description="You're currently viewing the demo version of Fredy. Jobs won't scrape websites, and any changes you make will be reverted at midnight."
            />
            <br />
          </>
        )}
        {settings.analyticsEnabled === null && !settings.demoMode && <TrackingModal />}
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
          <PermissionAwareRoute
            name="General Settings"
            path="/generalSettings"
            component={<GeneralSettings />}
            currentUser={currentUser}
          />

          <Redirect from="/" to={'/jobs'} />
        </Switch>
      </div>
    </div>
  );
}

FredyApp.displayName = 'FredyApp';
