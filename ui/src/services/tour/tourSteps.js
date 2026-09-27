/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The onboarding tour's route through the app.
 *
 * Kept apart from the component because it is a decision rather than markup: which pages the tour
 * visits, in which order, what it points at on each, and which steps an account without the admin
 * bit never sees. Those are worth asserting on, and a component that drives the router is not.
 *
 * Every step names its copy by id only (`tour.step.<id>.title` and `.body`), so this module needs
 * no translation context and can be tested as plain JavaScript.
 */

/**
 * One stop on the tour.
 *
 * @typedef {Object} TourStep
 * @property {string} id Stable identifier, also the translation key segment.
 * @property {string} route Where the app has to be for this step.
 * @property {string|null} target CSS selector of the element to highlight, or null for a step
 *   that explains rather than points.
 * @property {boolean} [adminOnly] Only shown to administrators.
 * @property {boolean} [needsListing] Only shown when the tour has an example listing to open.
 */

/** Placeholder in a route that is replaced by the example listing's id. */
const LISTING_PLACEHOLDER = ':listingId';

/**
 * The whole tour, in order, before it is narrowed to one account.
 *
 * The targets are existing class names of the pages rather than attributes added for the tour, so
 * the tour does not leave traces in every view it visits. `test/ui/tourSteps.test.js` fails when a
 * selector no longer appears in the source, which is the one way this list could quietly rot.
 *
 * @type {ReadonlyArray<Readonly<TourStep>>}
 */
export const TOUR_STEPS = Object.freeze(
  [
    { id: 'welcome', route: '/dashboard', target: null },
    { id: 'dashboard', route: '/dashboard', target: '.dashboard__kpis' },
    { id: 'jobCreate', route: '/jobs/new', target: '.jobMutation__form' },
    { id: 'jobsOverview', route: '/jobs', target: '.jobGrid' },
    { id: 'listingsOverview', route: '/listings', target: '.listingsOverview__topbar' },
    { id: 'mapListings', route: '/map', target: '.map-view-container__map-wrapper' },
    { id: 'mapFilters', route: '/map', target: '.map-panel' },
    { id: 'finance', route: '/finance', target: '.finance__household' },
    {
      id: 'listingDetail',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      target: '.listing-detail__rail',
      needsListing: true,
    },
    {
      id: 'application',
      route: `/listings/listing/${LISTING_PLACEHOLDER}`,
      target: '.listing-actionbar__primary',
      needsListing: true,
    },
    { id: 'settings', route: '/settings/preferences', target: '.settingsShell__tabbar' },
    { id: 'admin', route: '/admin/system', target: '.settingsShell__tabbar', adminOnly: true },
    { id: 'finish', route: '/dashboard', target: null },
  ].map((step) => Object.freeze(step)),
);

/**
 * The tour as one account takes it.
 *
 * Administrators get the administration step on top of everything else. Steps that open the
 * example listing are left out when there is none to open, rather than sending the user to a
 * detail page that can only say "not found".
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
      route: step.needsListing ? step.route.replace(LISTING_PLACEHOLDER, encodeURIComponent(listingId)) : step.route,
    }));
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
