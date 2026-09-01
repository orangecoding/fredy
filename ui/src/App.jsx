/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { useEffect } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import SettingsLayout from './views/settings/SettingsLayout';
import PreferencesPage from './views/settings/pages/PreferencesPage';
import TravelTimePage from './views/settings/pages/TravelTimePage';
import ListingDetailsPage from './views/settings/pages/ListingDetailsPage';
import NotificationsPage from './views/settings/pages/NotificationsPage';
import ConnectionsPage from './views/settings/pages/ConnectionsPage';
import AdminLayout from './views/admin/AdminLayout';
import SystemPage from './views/admin/pages/SystemPage';
import ExecutionPage from './views/admin/pages/ExecutionPage';
import ConnectivityPage from './views/admin/pages/ConnectivityPage';
import RoutingPage from './views/admin/pages/RoutingPage.jsx';
import BackupPage from './views/admin/pages/BackupPage';
import DebugPage from './views/admin/pages/DebugPage';
import JobMutation from './views/jobs/mutation/JobMutation';
import UserMutator from './views/user/mutation/UserMutator';
import { useActions, useSelector } from './services/state/store';
import { useBrowserNotifications } from './hooks/useBrowserNotifications';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router';
import Login from './views/login/Login';
import Users from './views/user/Users';
import Jobs from './views/jobs/Jobs';

import './App.less';
import TrackingModal from './components/tracking/TrackingModal.jsx';
import { LocaleProvider } from '@douyinfe/semi-ui-19';
import VersionBanner from './components/version/VersionBanner.jsx';
import Listings from './views/listings/Listings.jsx';
import MapView from './views/listings/Map.jsx';
import Navigation from './components/navigation/Navigation.jsx';
import { Layout } from '@douyinfe/semi-ui-19';
import FredyFooter from './components/footer/FredyFooter.jsx';
import Dashboard from './views/dashboard/Dashboard.jsx';
import FinanceCalculator from './views/finance/FinanceCalculator.jsx';
import ListingDetail from './views/listings/ListingDetail.jsx';
import NewsModal from './components/news/NewsModal.jsx';
import { I18nProvider, availableLanguages } from './services/i18n/i18n.jsx';
import DebugLoggingBanner from './components/debug/DebugLoggingBanner.jsx';
import DemoBanner from './components/demo/DemoBanner.jsx';
import { LEGACY_REDIRECTS } from './services/routes/legacyRedirects.js';
import { applyTheme, normalizeTheme } from './services/theme/theme.js';

const semiLocaleModules = import.meta.glob('/node_modules/@douyinfe/semi-ui-19/lib/es/locale/source/*.js', {
  eager: true,
});

const semiLocales = {};
for (const [path, mod] of Object.entries(semiLocaleModules)) {
  const name = path.match(/\/source\/(\w+)\.js$/)?.[1];
  if (name) semiLocales[name] = mod.default ?? mod;
}

/**
 * Carry the user id from the old edit URL over to the new one.
 *
 * `<Navigate to="/admin/users/edit/:userId">` would navigate to the literal string, so the
 * parameter has to be read and put back.
 *
 * @returns {React.ReactElement}
 */
function LegacyUserEditRedirect() {
  const { userId } = useParams();
  return <Navigate to={`/admin/users/edit/${userId}`} replace />;
}

LegacyUserEditRedirect.displayName = 'LegacyUserEditRedirect';

export default function FredyApp() {
  const location = useLocation();
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  /** userId the stores were actually filled for. Only set once the requests have landed. */
  const initializedFor = React.useRef(null);
  /**
   * Whether a fill is in flight.
   *
   * The effect runs twice on a hard refresh - once on mount, once when the user lands in the
   * store - and without this the second run saw the ref already set, dropped `loading`, and
   * rendered the route while the first run was still fetching. Anything that seeds its state
   * from a store slice on mount (the job editor's twelve fields, view-mode toggles) then kept
   * the empty values it saw and never recovered.
   */
  const initInFlight = React.useRef(false);
  const currentUser = useSelector((state) => state.user.currentUser);
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  const settings = useSelector((state) => state.generalSettings.settings);
  const language = useSelector((state) => state.userSettings.settings.language);
  /*
   * Straight off the user's stored settings, with nothing cached in front of it. Until those have
   * arrived - on the login screen, and for the moment a cold load spends fetching them - this is
   * the default, which is also what index.html ships on the body, so nothing repaints.
   */
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));

  useBrowserNotifications();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    // Already filled for this user: nothing to do. Checked against the ref, which is only set
    // after the requests resolved, so this cannot short-circuit a fill that is still running.
    if (currentUser?.userId != null && initializedFor.current === currentUser.userId) {
      setLoading(false);
      return;
    }

    async function init() {
      // A second run must not race the first one to `setLoading(false)`.
      if (initInFlight.current) {
        return;
      }
      initInFlight.current = true;
      try {
        // Judge on the user this call just returned, not on the one in the render closure: on a
        // hard refresh that closure is still null, so the guard below used to skip every load,
        // drop `loading`, and render the whole app against empty stores. Anything that seeds
        // component state from settings on mount (the finance calculator, view-mode toggles)
        // then kept the blank values it saw.
        const user = await actions.user.getCurrentUser();
        const userId = user?.userId ?? null;

        if (userId == null) {
          initializedFor.current = null;
          setLoading(false);
          return;
        }

        if (initializedFor.current !== userId) {
          // These are independent of each other, so they go out together. Awaiting them one after
          // the other meant nine serial round trips before the first pixel.
          await Promise.all([
            actions.provider.getProvider(),
            actions.jobsData.getJobs(),
            actions.jobsData.getSharableUserList(),
            actions.notificationAdapter.getAdapter(),
            actions.generalSettings.getGeneralSettings(),
            actions.userSettings.getUserSettings(),
            // Powers every finance surface; derived server-side so the browser holds no such math.
            actions.finance.getProfileSummary(),
          ]);
          // Marked done only now: a route that seeds its state from the store on mount must not
          // be rendered before the store actually holds it.
          initializedFor.current = userId;
          // Nothing in the first render depends on these two - the version banner and the
          // tracking modal appear when they arrive - so they must not hold up the app.
          // getVersionUpdate in particular reaches out to api.github.com.
          actions.versionUpdate.getVersionUpdate();
          actions.tracking.getTrackingPois();
        }

        setLoading(false);
      } finally {
        initInFlight.current = false;
      }
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
          // Keyed on the theme so everything below remounts when it changes. The stylesheets follow the
          // body attribute on their own, but the charts paint onto a canvas from colours they read once
          // per render, and a canvas keeps whatever it was last painted with until something redraws it.
          <Layout className="app" key={theme}>
            <Sider>
              <Navigation isAdmin={isAdmin()} />
            </Sider>
            <Layout className="app__main">
              <Content className="app__content">
                {versionUpdate?.newVersion && <VersionBanner />}
                <DebugLoggingBanner />
                {settings.demoMode && <DemoBanner />}
                {settings.analyticsEnabled === null && !settings.demoMode && <TrackingModal />}
                {!settings.demoMode && <NewsModal />}
                <Routes>
                  <Route path="/403" element={<InsufficientPermission />} />
                  <Route path="/jobs/new" element={<JobMutation />} />
                  <Route path="/jobs/edit/:jobId" element={<JobMutation />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/jobs" element={<Jobs />} />
                  <Route path="/listings" element={<Listings />} />
                  <Route path="/listings/listing/:listingId" element={<ListingDetail />} />
                  <Route path="/map" element={<MapView />} />
                  <Route path="/finance" element={<FinanceCalculator />} />

                  {/* Settings that belong to whoever is signed in. No guard: they are theirs.
                      One entry in the sidebar, and the tabs below the heading are the only place
                      these five pages are named. */}
                  <Route path="/settings" element={<SettingsLayout />}>
                    <Route index element={<Navigate to="/settings/preferences" replace />} />
                    <Route path="preferences" element={<PreferencesPage />} />
                    <Route path="travel-time" element={<TravelTimePage />} />
                    <Route path="listings" element={<ListingDetailsPage />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="connections" element={<ConnectionsPage />} />
                  </Route>

                  {/* Settings that belong to the instance. Guarded once, at the parent, so a new
                      page cannot be added without inheriting the check. */}
                  <Route
                    path="/admin"
                    element={
                      <PermissionAwareRoute currentUser={currentUser}>
                        <AdminLayout />
                      </PermissionAwareRoute>
                    }
                  >
                    <Route index element={<Navigate to="/admin/system" replace />} />
                    <Route path="system" element={<SystemPage />} />
                    <Route path="execution" element={<ExecutionPage />} />
                    <Route path="connectivity" element={<ConnectivityPage />} />
                    <Route path="routing" element={<RoutingPage />} />
                    <Route path="users" element={<Users />} />
                    <Route path="users/new" element={<UserMutator />} />
                    <Route path="users/edit/:userId" element={<UserMutator />} />
                    <Route path="backup" element={<BackupPage />} />
                    <Route path="debug" element={<DebugPage />} />
                  </Route>

                  {/* The addresses these things used to live at, kept so existing bookmarks and the
                      links in older notification emails still land somewhere sensible. The table
                      lives in legacyRedirects.js so a test can check every entry still resolves. */}
                  {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
                    <Route key={from} path={from} element={<Navigate to={to} replace />} />
                  ))}
                  {/* Carries a parameter, so it needs a component rather than a table entry. */}
                  <Route path="/users/edit/:userId" element={<LegacyUserEditRedirect />} />

                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  {/* Catch-all: an authenticated user landing on an unknown path (e.g. still on
                      /login during the post-login transition) is sent to the dashboard instead
                      of matching no route. */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
