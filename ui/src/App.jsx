import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import GeneralSettings from './views/generalSettings/GeneralSettings';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import JobInsight from './views/jobs/insights/JobInsight.jsx';
import { useActions, useSelector } from './services/state/store';
import { Routes, Route, Navigate } from 'react-router-dom';
import Logout from './components/logout/Logout';
import Logo from './components/logo/Logo';
import Menu from './components/menu/Menu';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';

import './App.less';
import TrackingModal from './components/tracking/TrackingModal.jsx';
import { Banner } from '@douyinfe/semi-ui';
import VersionBanner from './components/version/VersionBanner.jsx';
import Listings from './views/listings/Listings.jsx';

export default function FredyApp() {
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const currentUser = useSelector((state) => state.user.currentUser);
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  const settings = useSelector((state) => state.generalSettings.settings);

  useEffect(() => {
    async function init() {
      await actions.user.getCurrentUser();
      if (!needsLogin()) {
        await actions.provider.getProvider();
        await actions.jobs.getJobs();
        await actions.jobs.getProcessingTimes();
        await actions.notificationAdapter.getAdapter();
        await actions.generalSettings.getGeneralSettings();
        await actions.versionUpdate.getVersionUpdate();
      }
      setLoading(false);
    }

    init();
  }, [currentUser?.userId]);

  const needsLogin = () => {
    return currentUser == null || Object.keys(currentUser).length === 0;
  };

  const isAdmin = () => currentUser != null && currentUser.isAdmin;

  return loading ? null : needsLogin() ? (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  ) : (
    <div className="app">
      <div className="app__container">
        <Logout />
        <Logo width={190} white />
        <Menu isAdmin={isAdmin()} />
        {versionUpdate?.newVersion && <VersionBanner />}
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
        <Routes>
          <Route path="/403" element={<InsufficientPermission />} />
          <Route path="/jobs/new" element={<JobMutation />} />
          <Route path="/jobs/edit/:jobId" element={<JobMutation />} />
          <Route path="/jobs/insights/:jobId" element={<JobInsight />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/listings" element={<Listings />} />

          {/* Permission-aware routes */}
          <Route
            path="/users/new"
            element={
              <PermissionAwareRoute currentUser={currentUser}>
                <UserMutator />
              </PermissionAwareRoute>
            }
          />
          <Route
            path="/users/edit/:userId"
            element={
              <PermissionAwareRoute currentUser={currentUser}>
                <UserMutator />
              </PermissionAwareRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PermissionAwareRoute currentUser={currentUser}>
                <Users />
              </PermissionAwareRoute>
            }
          />
          <Route
            path="/generalSettings"
            element={
              <PermissionAwareRoute currentUser={currentUser}>
                <GeneralSettings />
              </PermissionAwareRoute>
            }
          />

          <Route path="/" element={<Navigate to="/jobs" replace />} />
        </Routes>
      </div>
    </div>
  );
}

FredyApp.displayName = 'FredyApp';
