/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The onboarding tour's route through the app.
 *
 * Two kinds of step alternate. An `info` step explains what is on the page and moves on with a
 * button. An `action` step points at the real control that leads to the next page - a sidebar entry,
 * the new-job button, a listing card - and waits for the user to click it, so the tour teaches the
 * way around instead of teleporting through it. An action step is done as soon as the app is on the
 * page it leads to, however the user got there.
 *
 * Kept apart from the component because it is a decision rather than markup. Every step names its
 * copy by id only (`tour.step.<id>.title` and `.body`), so this module needs no translation context
 * and can be tested as plain JavaScript.
 */

/**
 * One stop on the tour.
 *
 * @typedef {Object} TourStep
 * @property {string} id Stable identifier, also the translation key segment.
 * @property {'info'|'action'} type
 * @property {string} route Where the app has to be for this step; the tour navigates there when it
 *   is not, for example after going back.
 * @property {string} [match] Path prefix that also counts as being on the step's page, for a step
 *   whose page has variants (any listing, any settings tab).
 * @property {string[]} targets CSS selectors of the element the step is about, first match wins. Empty
 *   for a step that explains rather than points. Several, so a sidebar entry inside a closed group
 *   falls back to the group itself, and the spotlight moves on to the entry once it is opened.
 * @property {string} [expect] Action steps: path prefix of the page the click leads to.
 * @property {string} [labelKey] Action steps: translation key of the control's visible label, for the
 *   step's copy.
 * @property {string} [groupKey] Action steps: translation key of the sidebar group the control sits in.
 * @property {Record<string, string>} [vars] Translation keys of further labels the step's copy names,
 *   by placeholder, so the copy says exactly what the page it points to is called.
 * @property {boolean} [interactive] Info steps: the element stays usable, because the step invites
 *   trying it out (clicking a pin, switching a filter, typing into the household form). Every other
 *   info step shields its element, so a stray click cannot take the tour off its page.
 * @property {boolean} [adminOnly] Only shown to administrators.
 * @property {boolean} [needsListing] Only shown when the tour has an example listing to open.
 */

/** Placeholder in a route that is replaced by the example listing's id. */
const LISTING_PLACEHOLDER = ':listingId';

/** Selectors of the sidebar entry for a route, and of the group holding it while that is closed. */
const navTarget = (key, group = null) =>
  group == null ? [`[data-tour="${key}"]`] : [`[data-tour="${key}"]`, `[data-tour="${group}"]`];

/**
 * The whole tour, in order, before it is narrowed to one account.
 *
 * Info steps point at class names the pages already carry; action steps at `data-tour` attributes on
 * the controls. `test/ui/tourSteps.test.js` fails when either no longer appears in the source.
 *
 * @type {ReadonlyArray<Readonly<TourStep>>}
 */
export const TOUR_STEPS = Object.freeze(
  [
    { id: 'welcome', type: 'info', route: '/dashboard', targets: [] },
    { id: 'dashboard', type: 'info', route: '/dashboard', targets: ['.dashboard__kpis'] },
    { id: 'dashboardLatest', type: 'info', route: '/dashboard', targets: ['.dashboard__main'] },
    { id: 'dashboardInsights', type: 'info', route: '/dashboard', targets: ['.dashboard__rail'] },
    {
      id: 'goJobs',
      type: 'action',
      route: '/dashboard',
      targets: navTarget('/jobs'),
      expect: '/jobs',
      labelKey: 'nav.jobs',
    },
    { id: 'jobsOverview', type: 'info', route: '/jobs', targets: ['.jobGrid'] },
    {
      id: 'goNewJob',
      type: 'action',
      route: '/jobs',
      targets: ['[data-tour="new-job"]'],
      expect: '/jobs/new',
      labelKey: 'jobs.newJob',
    },
    { id: 'jobCreate', type: 'info', route: '/jobs/new', targets: ['.jobMutation__basics'] },
    { id: 'jobProviders', type: 'info', route: '/jobs/new', targets: ['.jobMutation__providers'] },
    { id: 'jobChannels', type: 'info', route: '/jobs/new', targets: ['.jobMutation__channels'] },
    { id: 'jobRefine', type: 'info', route: '/jobs/new', targets: ['.jobMutation__refine'] },
    {
      id: 'goListings',
      type: 'action',
      route: '/jobs/new',
      targets: navTarget('/listings', 'listings'),
      expect: '/listings',
      labelKey: 'nav.listingsOverview',
      groupKey: 'nav.listings',
    },
    {
      id: 'listingsOverview',
      type: 'info',
      interactive: true,
      route: '/listings',
      targets: ['.listingsOverview__topbar'],
    },
    {
      id: 'openListing',
      type: 'action',
      route: '/listings',
      targets: ['.listingsGrid__card'],
      expect: '/listings/listing/',
      needsListing: true,
    },
    {
      id: 'listingDetail',
      type: 'info',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      match: '/listings/listing/',
      targets: ['.listing-detail__sec--keyfacts'],
      needsListing: true,
    },
    {
      id: 'listingTravelTime',
      type: 'info',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      match: '/listings/listing/',
      targets: ['.listing-detail__sec--location'],
      vars: { section: 'nav.settings', tab: 'settings.tabTravelTime' },
      needsListing: true,
    },
    {
      id: 'listingTransit',
      type: 'info',
      interactive: true,
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      match: '/listings/listing/',
      targets: ['.listing-detail__sec--transit'],
      needsListing: true,
    },
    {
      // Only on screen once an administrator switched the enrichment on. Without it the step points
      // at nothing and says where it is switched on, which is the more useful half anyway.
      id: 'listingConnectivity',
      type: 'info',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      match: '/listings/listing/',
      targets: ['.listing-detail__sec--connectivity'],
      vars: { section: 'nav.administration', tab: 'admin.tabConnectivity' },
      needsListing: true,
    },
    {
      id: 'application',
      type: 'info',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      match: '/listings/listing/',
      targets: ['.listing-actionbar__primary'],
      needsListing: true,
    },
    {
      id: 'goMap',
      type: 'action',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      match: '/listings/listing/',
      targets: navTarget('/map', 'listings'),
      expect: '/map',
      labelKey: 'nav.mapView',
      groupKey: 'nav.listings',
      needsListing: true,
    },
    {
      id: 'mapListings',
      type: 'info',
      interactive: true,
      route: '/map',
      targets: ['.map-view-container__map-wrapper'],
    },
    { id: 'mapFilters', type: 'info', interactive: true, route: '/map', targets: ['.map-panel'] },
    {
      id: 'goFinance',
      type: 'action',
      route: '/map',
      targets: navTarget('/finance', 'listings'),
      expect: '/finance',
      labelKey: 'nav.finance',
      groupKey: 'nav.listings',
    },
    { id: 'finance', type: 'info', interactive: true, route: '/finance', targets: ['.finance__household'] },
    {
      id: 'goSettings',
      type: 'action',
      route: '/finance',
      targets: navTarget('/settings'),
      expect: '/settings',
      labelKey: 'nav.settings',
    },
    {
      id: 'settings',
      type: 'info',
      interactive: true,
      route: '/settings/preferences',
      match: '/settings',
      targets: ['.settingsShell__tabbar'],
    },
    {
      id: 'goAdmin',
      type: 'action',
      route: '/settings/preferences',
      match: '/settings',
      targets: navTarget('/admin'),
      expect: '/admin',
      labelKey: 'nav.administration',
      adminOnly: true,
    },
    {
      id: 'admin',
      type: 'info',
      interactive: true,
      route: '/admin/system',
      match: '/admin',
      targets: ['.settingsShell__tabbar'],
      adminOnly: true,
    },
    { id: 'finish', type: 'info', route: '/dashboard', targets: [] },
  ].map((step) => Object.freeze({ ...step, targets: Object.freeze([...step.targets]) })),
);

/**
 * The tour as one account takes it.
 *
 * Administrators get the administration steps on top of everything else. Steps that open the
 * example listing are left out when there is none, rather than sending the user to a detail page that
 * can only say "not found".
 *
 * @param {Object} params
 * @param {boolean} params.isAdmin
 * @param {string|null|undefined} params.listingId Id of the example listing, if the tour has one.
 * @returns {TourStep[]} The steps with every route resolved.
 */
export function buildTourSteps({ isAdmin, listingId }) {
  const hasListing = typeof listingId === 'string' && listingId.length > 0;
  return TOUR_STEPS.filter((step) => !step.adminOnly || isAdmin)
    .filter((step) => !step.needsListing || hasListing)
    .map((step) => ({
      ...step,
      route: step.route.includes(LISTING_PLACEHOLDER)
        ? step.route.replace(LISTING_PLACEHOLDER, encodeURIComponent(listingId))
        : step.route,
    }));
}

/**
 * Whether the app is on a step's page.
 *
 * @param {TourStep} step
 * @param {string} pathname
 * @returns {boolean}
 */
export function isOnStepPage(step, pathname) {
  if (step == null) return false;
  return pathname === step.route || (step.match != null && pathname.startsWith(step.match));
}

/**
 * Whether an action step has been carried out: the app is on the page its control leads to.
 *
 * A prefix only matches on a path boundary unless it already ends in one, so `/jobsx` would not
 * count as `/jobs`, while `/settings` does count once the app has redirected on to
 * `/settings/preferences`.
 *
 * @param {TourStep} step
 * @param {string} pathname
 * @returns {boolean}
 */
export function isActionDone(step, pathname) {
  if (step?.type !== 'action' || step.expect == null) return false;
  if (step.expect.endsWith('/')) return pathname.startsWith(step.expect);
  return pathname === step.expect || pathname.startsWith(`${step.expect}/`);
}

/**
 * Translation key of a step's heading.
 *
 * @param {string} stepId
 * @returns {string}
 */
export function stepTitleKey(stepId) {
  return `tour.step.${stepId}.title`;
}

/**
 * Translation key of a step's explanation.
 *
 * @param {string} stepId
 * @returns {string}
 */
export function stepBodyKey(stepId) {
  return `tour.step.${stepId}.body`;
}
