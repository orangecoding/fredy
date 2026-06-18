/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import GeneralSettings from './views/generalSettings/GeneralSettings';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import { useActions, useSelector } from './services/state/store';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';

import './App.less';
import TrackingModal from './components/tracking/TrackingModal.jsx';
import { Banner, LocaleProvider } from '@douyinfe/semi-ui-19';
import VersionBanner from './components/version/VersionBanner.jsx';
import Listings from './views/listings/Listings.jsx';
import MapView from './views/listings/Map.jsx';
import Navigation from './components/navigation/Navigation.jsx';
import { Layout } from '@douyinfe/semi-ui-19';
import FredyFooter from './components/footer/FredyFooter.jsx';
import WatchlistManagement from './views/listings/management/WatchlistManagement.jsx';
import Dashboard from './views/dashboard/Dashboard.jsx';
import ListingDetail from './views/listings/ListingDetail.jsx';
import NewsModal from './components/news/NewsModal.jsx';
import { I18nProvider, availableLanguages } from './services/i18n/i18n.jsx';
import DebugLoggingBanner from './components/debug/DebugLoggingBanner.jsx';

const semiLocaleModules = import.meta.glob('/node_modules/@douyinfe/semi-ui-19/lib/es/locale/source/*.js', {
  eager: true,
});

const semiLocales = {};
for (const [path, mod] of Object.entries(semiLocaleModules)) {
  const name = path.match(/\/source\/(\w+)\.js$/)?.[1];
  if (name) semiLocales[name] = mod.default ?? mod;
}

export default function FredyApp() {
  const location = useLocation();
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const currentUser = useSelector((state) => state.user.currentUser);
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  const settings = useSelector((state) => state.generalSettings.settings);
  const language = useSelector((state) => state.userSettings.settings.language);

  useEffect(() => {
    async function init() {
      await actions.user.getCurrentUser();
      if (!needsLogin()) {
        await actions.provider.getProvider();
        await actions.jobsData.getJobs();
        await actions.jobsData.getSharableUserList();
        await actions.notificationAdapter.getAdapter();
        await actions.generalSettings.getGeneralSettings();
        await actions.userSettings.getUserSettings();
        await actions.versionUpdate.getVersionUpdate();
        await actions.tracking.getTrackingPois();
      }
      setLoading(false);
    }

    init();
  }, [currentUser?.userId]);

  // When any request reports a 401 (expired session), drop the cached user. That flips
  // needsLogin() to true, so the router shows the login screen (carrying the current
  // location as `from` so the user is sent back here after re-authenticating).
  useEffect(() => {
    const onUnauthorized = () => actions.user.resetCurrentUser();
    window.addEventListener('fredy:unauthorized', onUnauthorized);
    return () => window.removeEventListener('fredy:unauthorized', onUnauthorized);
  }, []);

  const needsLogin = () => {
    return currentUser == null || Object.keys(currentUser).length === 0;
  };

  const isAdmin = () => currentUser != null && currentUser.isAdmin;
  const { Sider, Content } = Layout;

  return loading ? null : (
    <I18nProvider language={language ?? 'en'}>
      <LocaleProvider
        locale={
          semiLocales[availableLanguages.find((l) => l.code === (language ?? 'en'))?.semiLocale] ?? semiLocales['en_US']
        }
      >
        {needsLogin() ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate state={{ from: location }} to="/login" replace />} />
          </Routes>
        ) : (
          <Layout className="app">
            <Sider>
              <Navigation isAdmin={isAdmin()} />
            </Sider>
            <Layout className="app__main">
              <Content className="app__content">
                {versionUpdate?.newVersion && <VersionBanner />}
                <DebugLoggingBanner />
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
                {!settings.demoMode && <NewsModal />}
                <Routes>
                  <Route path="/403" element={<InsufficientPermission />} />
                  <Route path="/jobs/new" element={<JobMutation />} />
                  <Route path="/jobs/edit/:jobId" element={<JobMutation />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/listings" element={<Listings />} />
                  <Route path="/listings/watchlist" element={<Listings mode="watchlist" />} />
                  <Route path="/listings/listing/:listingId" element={<ListingDetail />} />
                  <Route path="/map" element={<MapView />} />
                  <Route path="/watchlistManagement" element={<WatchlistManagement />} />

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
                  <Route path="/userSettings" element={<Navigate to="/generalSettings" replace />} />
                  <Route path="/generalSettings" element={<GeneralSettings />} />

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Content>
              <FredyFooter />
            </Layout>
          </Layout>
        )}
      </LocaleProvider>
    </I18nProvider>
  );
}

FredyApp.displayName = 'FredyApp';
