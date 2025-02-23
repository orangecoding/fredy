import React, { useEffect } from 'react';
import { Banner } from '@douyinfe/semi-ui';
import { useDispatch, useSelector } from 'react-redux';
import { Switch, Redirect } from 'react-router-dom';
import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import JobInsight from './views/jobs/insights/JobInsight.jsx';
import Logout from './components/logout/Logout';
import Logo from './components/logo/Logo';
import Menu from './components/menu/Menu';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';
import { Route } from 'react-router';
import TrackingModal from './components/tracking/TrackingModal.jsx';
import { RootState } from './types/index.js';
import './App.less';
import GeneralSettingsView from './views/generalSettings/GeneralSettings.tsx';

export default function FredyApp() {
  const dispatch = useDispatch();
  const [loading, setLoading] = React.useState<boolean>(true);
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const settings = useSelector((state: RootState) => state.generalSettings.settings);

  useEffect(() => {
    async function init() {
      await dispatch.user.getCurrentUser();
      if (!needsLogin()) {
        const awaits = [];
        setLoading(true);
        awaits.push(dispatch.generalSettings.getGeneralSettings());
        awaits.push(dispatch.provider.getProvider());
        awaits.push(dispatch.jobs.getJobs());
        awaits.push(dispatch.jobs.getProcessingTimes());
        awaits.push(dispatch.notificationAdapter.getAdapter());
        await Promise.all(awaits);
      }
      // eslint-disable-next-line no-console
      console.info('init finished', currentUser, JSON.stringify(settings));
      setLoading(false);
    }

    init();
  }, [currentUser?.id]);

  const needsLogin = () => {
    return currentUser == null || Object.keys(currentUser).length === 0;
  };

  const isAdmin = () => currentUser != null && currentUser.isAdmin;

  const login = () => (
    <Switch>
      <Route path="/login" component={Login} />
      <Redirect from="*" to="/login" />
    </Switch>
  );
  return loading ? null : needsLogin() ? (
    login()
  ) : (
    <div className="app">
      {(() => {
        // eslint-disable-next-line no-console
        console.info(loading.toString(), JSON.stringify(settings));
        return null;
      })()}
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
          <Route path="/403" component={InsufficientPermission} />
          <Route path="/jobs/new" component={JobMutation} />
          <Route path="/jobs/edit/:jobId" component={JobMutation} />
          <Route path="/jobs/insights/:jobId" component={JobInsight} />
          <Route path="/jobs" component={Jobs} />
          {/* <PermissionAwareRoute
            path="/provider"
            component={ProviderPage}
            currentUser={currentUser}
          /> */}
          <PermissionAwareRoute path="/users/new" component={UserMutator} currentUser={currentUser} />
          <PermissionAwareRoute path="/users/edit/:userId" component={UserMutator} currentUser={currentUser} />
          <PermissionAwareRoute path="/users" component={Users} currentUser={currentUser} />
          <PermissionAwareRoute path="/generalSettings" component={GeneralSettingsView} currentUser={currentUser} />
          <Redirect from="/" to={'/jobs'} />
        </Switch>
      </div>
    </div>
  );
}

FredyApp.displayName = 'FredyApp';
