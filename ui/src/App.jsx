/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';

import InsufficientPermission from './components/permission/InsufficientPermission';
import PermissionAwareRoute from './components/permission/PermissionAwareRoute';
import { useActions, useSelector } from './services/state/store';
import { useBrowserNotifications } from './hooks/useBrowserNotifications';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router';
import Login from './views/login/Login';

import './App.less';
import TrackingModal from './components/tracking/TrackingModal.jsx';
import { LocaleProvider } from '@douyinfe/semi-ui-19';
import semiEnUS from '@douyinfe/semi-ui-19/lib/es/locale/source/en_US';
import Navigation from './components/navigation/Navigation.jsx';
import { Layout } from '@douyinfe/semi-ui-19';
import FredyFooter from './components/footer/FredyFooter.jsx';
import MobileAppBar from './components/navigation/MobileAppBar.jsx';
import MobileTabBar from './components/navigation/MobileTabBar.jsx';
import { useNavStatus } from './components/navigation/useNavStatus.js';
import PhoneUpdateNotice from './components/version/PhoneUpdateNotice.jsx';
import { useIsPhone } from './hooks/screenWidth.js';
import NewsModal from './components/news/NewsModal.jsx';
import OnboardingTour from './components/tour/OnboardingTour.jsx';
import inDevelopment from './services/developmentMode.js';
import { I18nProvider, availableLanguages } from './services/i18n/i18n.jsx';
import DebugLoggingBanner from './components/debug/DebugLoggingBanner.jsx';
import DemoBanner from './components/demo/DemoBanner.jsx';
import { LEGACY_REDIRECTS } from './services/routes/legacyRedirects.js';
import { applyTheme, normalizeTheme } from './services/theme/theme.js';

// Every page but the login screen loads on first visit. The start bundle used to carry all of them,
// chart.js and MapLibre included, and the login screen on a phone waited for megabytes of pages it
// does not show. All of them render inside the one <Suspense> around the routes.
const Dashboard = lazy(() => import('./views/dashboard/Dashboard.jsx'));
const Jobs = lazy(() => import('./views/jobs/Jobs'));
const JobMutation = lazy(() => import('./views/jobs/mutation/JobMutation'));
const Listings = lazy(() => import('./views/listings/Listings.jsx'));
const ListingDetail = lazy(() => import('./views/listings/ListingDetail.jsx'));
const MapView = lazy(() => import('./views/listings/Map.jsx'));
const FinanceCalculator = lazy(() => import('./views/finance/FinanceCalculator.jsx'));
const SettingsLayout = lazy(() => import('./views/settings/SettingsLayout'));
const SettingsIndexRoute = lazy(() => import('./components/settingsShell/SettingsIndex.jsx'));
const PreferencesPage = lazy(() => import('./views/settings/pages/PreferencesPage'));
const TravelTimePage = lazy(() => import('./views/settings/pages/TravelTimePage'));
const ListingDetailsPage = lazy(() => import('./views/settings/pages/ListingDetailsPage'));
const ApplicationPage = lazy(() => import('./views/settings/pages/ApplicationPage'));
const NotificationsPage = lazy(() => import('./views/settings/pages/NotificationsPage'));
const ConnectionsPage = lazy(() => import('./views/settings/pages/ConnectionsPage'));
const McpServerPage = lazy(() => import('./views/settings/pages/McpServerPage'));
const AdminLayout = lazy(() => import('./views/admin/AdminLayout'));
const SystemPage = lazy(() => import('./views/admin/pages/SystemPage'));
const ExecutionPage = lazy(() => import('./views/admin/pages/ExecutionPage'));
const ConnectivityPage = lazy(() => import('./views/admin/pages/ConnectivityPage'));
const RoutingPage = lazy(() => import('./views/admin/pages/RoutingPage.jsx'));
const BackupPage = lazy(() => import('./views/admin/pages/BackupPage'));
const DebugPage = lazy(() => import('./views/admin/pages/DebugPage'));
const Users = lazy(() => import('./views/user/Users'));
const UserMutator = lazy(() => import('./views/user/mutation/UserMutator'));

// Semi ships 57 locales and the app speaks six; all of them were in the start bundle. Only the one
// in use is fetched, and English, the fallback, is there from the start.
const semiLocaleLoaders = import.meta.glob('/node_modules/@douyinfe/semi-ui-19/lib/es/locale/source/*.js', {
  import: 'default',
});

/**
 * Semi's locale for the interface language, fetched when the language is first used.
 *
 * Until it arrives Semi's own few strings (an empty table, the pager) stay in English.
 *
 * @param {string} language The interface language code, e.g. 'de'.
 * @returns {Object} A Semi locale object for `LocaleProvider`.
 */
function useSemiLocale(language) {
  const name = availableLanguages.find((l) => l.code === language)?.semiLocale ?? 'en_US';
  const [loaded, setLoaded] = useState({ name: 'en_US', locale: semiEnUS });

  useEffect(() => {
    const load = semiLocaleLoaders[`/node_modules/@douyinfe/semi-ui-19/lib/es/locale/source/${name}.js`];
    if (name === 'en_US' || load == null) {
      setLoaded({ name: 'en_US', locale: semiEnUS });
      return undefined;
    }
    let current = true;
    load().then((locale) => {
      if (current) setLoaded({ name, locale });
    });
    return () => {
      current = false;
    };
  }, [name]);

  return loaded.locale;
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

/**
 * The frame around every page once someone is signed in.
 *
 * On a wide screen the sidebar and the footer, on a phone an app bar at the top and a tab bar at the
 * bottom. The page area keeps its place in the tree either way, so turning a phone on its side -
 * which crosses the breakpoint on most of them - swaps the navigation around the page without
 * remounting the page and throwing away whatever was typed into it.
 *
 * Its own component, so the navigation's status is only asked for while someone is signed in and
 * asked for again after every sign-in, as the sidebar always did.
 *
 * @param {Object} props
 * @param {boolean} props.isAdmin
 * @param {boolean} props.isPhone
 * @param {React.ReactNode} props.children The page area (`.app__content`).
 * @returns {React.ReactElement}
 */
function AppShell({ isAdmin, isPhone, children }) {
  const status = useNavStatus();
  const { Sider } = Layout;
  return (
    <Layout className={`app${isPhone ? ' app--phone' : ''}`}>
      {!isPhone && (
        <Sider>
          <Navigation isAdmin={isAdmin} status={status} />
        </Sider>
      )}
      <Layout className="app__main">
        {isPhone && <MobileAppBar isAdmin={isAdmin} status={status} />}
        {children}
        {isPhone ? <MobileTabBar isAdmin={isAdmin} counts={status.counts} /> : <FredyFooter />}
        {isPhone && <PhoneUpdateNotice />}
      </Layout>
    </Layout>
  );
}

AppShell.displayName = 'AppShell';

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
  const settings = useSelector((state) => state.generalSettings.settings);
  const language = useSelector((state) => state.userSettings.settings.language);
  const semiLocale = useSemiLocale(language ?? 'en');
  /*
   * Straight off the user's stored settings, with nothing cached in front of it. Until those have
   * arrived - on the login screen, and for the moment a cold load spends fetching them - this is
   * the default, which is also what index.html ships on the body, so nothing repaints.
   */
  const theme = normalizeTheme(useSelector((state) => state.userSettings.settings.theme));
  // On a phone the sidebar gives way to an app bar and a tab bar. Follows rotation and resizing.
  const isPhone = useIsPhone();

  useBrowserNotifications();

  // The stylesheets follow the body attribute on their own. A chart paints its canvas from colours
  // read when it is built, and none is on screen where the theme is switched (the preferences page),
  // so every chart is built after the switch. The layout used to be keyed on the theme for them,
  // and the remount threw away whatever had been typed on that page and not saved yet.
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
          // Nothing in the first render depends on these - the version line in the footer, the
          // What's New views and the tracking modal appear when they arrive - so they must not
          // hold up the app. The first two reach out to api.github.com.
          actions.versionUpdate.getVersionUpdate();
          actions.news.getReleases();
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
  const { Content } = Layout;
  // Never on a demo instance, and held back while the analytics question is still on screen.
  const tourBlocked = settings.analyticsEnabled === null && !inDevelopment();

  // The page itself, the same in both shells.
  const pageArea = (
    <Content className="app__content">
      <DebugLoggingBanner />
      {settings.demoMode && <DemoBanner />}
      {settings.analyticsEnabled === null && !settings.demoMode && <TrackingModal />}
      {!settings.demoMode && <NewsModal />}
      <Suspense fallback={null}>
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
          One entry in the sidebar, and the tabs below the heading name the pages. On a
          phone the index is a list of every settings page instead of a redirect to the
          first tab (SettingsIndex). */}
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsIndexRoute scope="user" />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="travel-time" element={<TravelTimePage />} />
            <Route path="listings" element={<ListingDetailsPage />} />
            <Route path="application" element={<ApplicationPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="mcp-server" element={<McpServerPage />} />
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
            <Route index element={<SettingsIndexRoute scope="instance" />} />
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
      </Suspense>
    </Content>
  );

  return loading ? null : (
    <I18nProvider language={language ?? 'en'}>
      <LocaleProvider locale={semiLocale}>
        {needsLogin() ? (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate state={{ from: location }} to="/login" replace />} />
          </Routes>
        ) : (
          <>
            {!settings.demoMode && <OnboardingTour isAdmin={isAdmin()} blocked={tourBlocked} />}
            <AppShell isAdmin={isAdmin()} isPhone={isPhone}>
              {pageArea}
            </AppShell>
          </>
        )}
      </LocaleProvider>
    </I18nProvider>
  );
}

FredyApp.displayName = 'FredyApp';
