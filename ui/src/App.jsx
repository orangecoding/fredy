import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import GeneralSettings from './views/generalSettings/GeneralSettings';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import JobInsight from './views/jobs/insights/JobInsight.jsx';
import { useDispatch, useSelector } from 'react-redux';
import { Routes, Route, Navigate } from 'react-router-dom';
import Logout from './components/logout/Logout';
import Logo from './components/logo/Logo';
import Menu from './components/menu/Menu';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';
import Listings from './views/listings/Listings';

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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
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
