/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings, getUserSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import { geocodeAddress } from '../../services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../services/geocoding/autocompleteService.js';
import {
  getCountriesForProviderIds,
  getCountriesForUser,
  resolveCountries,
} from '../../services/providers/providerCountries.js';
import { getTravelTimeProgress } from '../../services/storage/listingsStorage.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import { mergeSection, stripSection } from '../../services/finance/profileSections.js';
import { TEMPLATE_LANGUAGES } from '../../services/application/templates/index.js';
import { previewApplicationTemplate } from '../../services/application/preview.js';
import { updateUserSettings } from '../../services/settings/userSettingsService.js';
import { runGeoCordTask } from '../../services/crons/geocoding-cron.js';
import { sendFailure } from '../../services/serviceResult.js';

/**
 * The caller as the shared settings save takes it.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {{id: string, isAdmin: boolean}}
 */
const callerOf = (request) => ({ id: request.session.currentUser, isAdmin: isAdmin(request) });

/**
 * Longest template a user may store, in characters.
 *
 * Generous for a letter - roughly ten pages - and small enough that six overrides cannot turn the
 * settings row every request reads into something worth worrying about.
 */
const MAX_APPLICATION_TEMPLATE_LENGTH = 20000;

/** The two letters that exist per language. */
const APPLICATION_DEAL_TYPES = ['rent', 'buy'];

/**
 * Check a template override bundle before it is stored.
 *
 * @param {unknown} templates Shape: `{ de: { rent: '…', buy: '…' }, … }`.
 * @returns {string|null} The problem, or null when the bundle is fine.
 */
function validateApplicationTemplates(templates) {
  if (typeof templates !== 'object' || templates == null || Array.isArray(templates)) {
    return 'application_templates must be an object or null.';
  }

  for (const [language, perDealType] of Object.entries(templates)) {
    if (!TEMPLATE_LANGUAGES.includes(language)) {
      return `No application letters are written in "${language}".`;
    }
    if (typeof perDealType !== 'object' || perDealType == null || Array.isArray(perDealType)) {
      return `application_templates.${language} must be an object.`;
    }
    for (const [dealType, template] of Object.entries(perDealType)) {
      if (!APPLICATION_DEAL_TYPES.includes(dealType)) {
        return `"${dealType}" is not a deal type; expected one of ${APPLICATION_DEAL_TYPES.join(', ')}.`;
      }
      if (typeof template !== 'string') {
        return `application_templates.${language}.${dealType} must be a string.`;
      }
      if (template.length > MAX_APPLICATION_TEMPLATE_LENGTH) {
        return `A template may be at most ${MAX_APPLICATION_TEMPLATE_LENGTH} characters long.`;
      }
    }
  }

  return null;
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
/**
 * Which countries an address lookup from the UI should search.
 *
 * The job form knows which providers are ticked and says so, because the map beneath the search box
 * is bounded by those same providers and the two must not disagree. Every other caller - the home
 * address form, the travel time settings, the listing address editor - has no provider in hand, and
 * gets the union across the jobs the user can see.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<string[]>} ISO 3166-1 alpha-2 codes.
 */
async function countriesInScope(request) {
  const raw = request.query?.providers;
  const providerIds =
    typeof raw === 'string'
      ? raw
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      : [];

  return providerIds.length > 0
    ? resolveCountries(() => getCountriesForProviderIds(providerIds))
    : resolveCountries(() => getCountriesForUser(request.session?.currentUser));
}

export default async function userSettingsPlugin(fastify) {
  fastify.get('/', async (request) => {
    const userId = request.session.currentUser;
    return getUserSettings(userId);
  });

  fastify.get('/autocomplete', async (request, reply) => {
    const { q } = request.query;
    try {
      const results = await autocompleteAddress(q, await countriesInScope(request));
      return results;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Resolve an address to coordinates, so the map in the job form can jump to a place the user
   * names instead of making them pan across the country to find it.
   *
   * Separate from `/autocomplete`, which answers with display names only: the suggestions are
   * for choosing, this is for locating, and only the chosen one needs to cost a geocode.
   */
  fastify.get('/geocode', async (request, reply) => {
    const { q } = request.query;
    if (typeof q !== 'string' || q.trim().length === 0) {
      return reply.code(400).send({ error: 'A query is required.' });
    }
    try {
      const coordinates = await geocodeAddress(q.trim(), await countriesInScope(request));
      // Nominatim reports "looked, found nothing" as -1/-1, which is a successful lookup with an
      // empty answer rather than a failure. The UI needs to tell those apart to say something
      // useful, so it comes back as 404 rather than coordinates in the Atlantic.
      if (coordinates == null || coordinates.lat === -1 || coordinates.lng === -1) {
        return reply.code(404).send({ error: 'No coordinates found for that address.' });
      }
      return coordinates;
    } catch (error) {
      logger.error('Error while geocoding an address for the map', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * How far through the travel-time backlog this user's listings are.
   *
   * Its own endpoint rather than part of the settings payload: it changes on the sweeper's clock
   * rather than on the user's, and it is the one thing on the travel time page that is worth
   * re-reading without a reload.
   */
  fastify.get('/travel-time-progress', async (request) => {
    return getTravelTimeProgress(request.session.currentUser);
  });

  fastify.post('/home-address', async (request, reply) => {
    // Geocoding the addresses, recomputing distances, the travel-time sweeper and the demo lock
    // live behind `updateUserSettings`, which the MCP settings tool shares. This route decides
    // which HTTP status code each failure is, and starts the one sweep below.
    try {
      const saved = await updateUserSettings(callerOf(request), { homeAddresses: request.body?.home_addresses });
      if (!saved.ok) return sendFailure(reply, saved);
      // Deliberately here and not in the shared save: this fills in the coordinates of listings
      // that have none, and pressing Save on an unchanged form is the only way anybody has to
      // retry a geocode that failed (issue #418 - somebody discovered exactly that, so putting it
      // behind the shared save would take the remedy away from the web and hand a second process
      // a second Nominatim budget). The geocoding cron picks those listings up anyway. It is a
      // no-op while a sweep is already running. A save that clears the form stores nothing to
      // retry for, and has never started one.
      if (saved.changes.homeAddresses.home_addresses.length > 0) runGeoCordTask();
      return { success: true, ...saved.changes.homeAddresses };
    } catch (error) {
      logger.error('Error updating addresses settings', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * A route that remembers, per user, the newest release some notice has already told them about.
   *
   * Versions rather than "dismissed" flags, because the question that matters across upgrades is
   * "what have you been told about", and a flag cannot answer it for the next release.
   *
   * @param {string} path
   * @param {string} name The setting, also the body field the version arrives in.
   */
  const versionMarkerRoute = (path, name) =>
    fastify.post(path, async (request, reply) => {
      const userId = request.session.currentUser;
      const version = request.body?.[name];

      const globalSettings = await getSettings();
      if (globalSettings.demoMode && !isAdmin(request)) {
        return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
      }

      // Loose on purpose - the browser sends back a version string it was given - but bounded, so
      // a scripted client cannot grow the row.
      if (typeof version !== 'string' || version.length > 64) {
        return reply.code(400).send({ error: `${name} must be a string of at most 64 characters.` });
      }

      try {
        upsertSettings({ [name]: version }, userId);
        return { success: true };
      } catch (error) {
        logger.error(`Error updating ${name}`, error);
        return reply.code(500).send({ error: error.message });
      }
    });

  // The release notes shown after an upgrade. Replaces `/news-hash`, which stored a hash of
  // whatever news.json held at the time: skip a release and its hash was never stored, so its news
  // was never shown again either.
  versionMarkerRoute('/news-last-seen-version', 'news_last_seen_version');

  // The toast that announces an available update, once per version.
  versionMarkerRoute('/update-notice-seen-version', 'update_notice_seen_version');

  // `POST /news-hash` used to live here. Nothing calls it since the news became version-keyed. The
  // stored `news_hash` rows are left alone rather than deleted: they cost nothing, and dropping
  // them would make a downgrade forget that those dialogs were ever dismissed.

  fastify.post('/provider-details', async (request, reply) => {
    const userId = request.session.currentUser;
    const { provider_details } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (!Array.isArray(provider_details)) {
      return reply.code(400).send({ error: 'provider_details must be an array of provider ids.' });
    }

    try {
      upsertSettings({ provider_details }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating provider details setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/blacklist-filter-on-details', async (request, reply) => {
    const userId = request.session.currentUser;
    const { blacklist_filter_on_provider_details } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (typeof blacklist_filter_on_provider_details !== 'boolean') {
      return reply.code(400).send({ error: 'blacklist_filter_on_provider_details must be a boolean.' });
    }

    try {
      upsertSettings({ blacklist_filter_on_provider_details }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating blacklist-filter-on-details setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Whether hovering a public transport stop on the map opens its departure board.
   *
   * Off unless stored, which is why there is no migration: an absent setting reads as false. The
   * board used to open on hover for everyone, and it got in the way of panning across a city with
   * stops all over it.
   */
  fastify.post('/transit-hover-popups', async (request, reply) => {
    const userId = request.session.currentUser;
    const { transit_hover_popups } = request.body || {};

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (typeof transit_hover_popups !== 'boolean') {
      return reply.code(400).send({ error: 'transit_hover_popups must be a boolean.' });
    }

    try {
      upsertSettings({ transit_hover_popups }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating the transit hover popups setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/listings-view-mode', async (request, reply) => {
    const userId = request.session.currentUser;
    const { listings_view_mode } = request.body;

    if (listings_view_mode !== 'grid' && listings_view_mode !== 'table') {
      return reply.code(400).send({ error: 'listings_view_mode must be "grid" or "table".' });
    }

    if (listings_view_mode === 'table') {
      await trackPoi(TRACKING_POIS.LISTING_TABLE_VIEW);
    }

    try {
      upsertSettings({ listings_view_mode }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating listings view mode setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/jobs-view-mode', async (request, reply) => {
    const userId = request.session.currentUser;
    const { jobs_view_mode } = request.body;

    if (jobs_view_mode !== 'grid' && jobs_view_mode !== 'table') {
      return reply.code(400).send({ error: 'jobs_view_mode must be "grid" or "table".' });
    }

    if (jobs_view_mode === 'table') {
      await trackPoi(TRACKING_POIS.JOBS_TABLE_VIEW);
    }

    try {
      upsertSettings({ jobs_view_mode }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating jobs view mode setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/listing-deletion-preference', async (request, reply) => {
    const userId = request.session.currentUser;
    const { listing_deletion_preference } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (listing_deletion_preference == null) {
      return reply.code(400).send({ error: 'listing_deletion_preference is required.' });
    }

    const { skipPrompt, hardDelete } = listing_deletion_preference;

    try {
      upsertSettings({ listing_deletion_preference: { skipPrompt, hardDelete } }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating listing deletion preference', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/finance-profile', async (request, reply) => {
    // Passing null is how the user clears their profile, which also hides every finance surface
    // again (the affordability filter, the chips, the detail card).
    try {
      const saved = await updateUserSettings(callerOf(request), { financeProfile: request.body?.finance_profile });
      if (!saved.ok) return sendFailure(reply, saved);
      return { success: true, finance_profile: saved.changes.financeProfile };
    } catch (error) {
      logger.error('Error updating finance profile', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Save or clear one tab (renting or buying) of the finance profile.
   *
   * The merge happens here rather than in the browser: the store used to read the currently
   * stored profile out of its own state and merge client-side, which meant a second copy of the
   * merge rules and a lost-update window between two tabs. The server merges against what is
   * actually stored.
   *
   * Body: `{ section: 'rent'|'buy', profile: Object }` to save, or `{ section, remove: true }`
   * to drop that tab while keeping the household and the other tab.
   */
  fastify.post('/finance-profile/section', async (request, reply) => {
    const userId = request.session.currentUser;
    const { section, profile, remove = false } = request.body || {};

    // The demo lock is the settings save's, below, like that of the whole profile.
    if (section !== 'rent' && section !== 'buy') {
      return reply.code(400).send({ error: 'section must be "rent" or "buy".' });
    }
    if (!remove && (profile == null || typeof profile !== 'object' || Array.isArray(profile))) {
      return reply.code(400).send({ error: 'profile must be an object when saving a section.' });
    }

    try {
      const stored = getUserSettings(userId)?.finance_profile ?? null;
      const next = remove ? stripSection(stored, section) : mergeSection(stored, section, profile);
      const saved = await updateUserSettings(callerOf(request), { financeProfile: next });
      if (!saved.ok) return sendFailure(reply, saved);
      return { success: true, finance_profile: saved.changes.financeProfile };
    } catch (error) {
      logger.error('Error updating a finance profile section', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Which of the two themes the interface is painted in.
   *
   * A closed set rather than free text: the value ends up on `<body theme-mode>`, and the only
   * two the stylesheets define a palette for are the two named here.
   */
  fastify.post('/theme', async (request, reply) => {
    try {
      const saved = await updateUserSettings(callerOf(request), { theme: request.body?.theme });
      if (!saved.ok) return sendFailure(reply, saved);
      // Against what the user was looking at a moment ago: a first-ever save of the default theme
      // changes nothing on screen and is not somebody switching theme.
      const { value, previous } = saved.changes.theme;
      if (value !== previous) {
        await trackPoi(value === 'light' ? TRACKING_POIS.CHANGE_THEME_LIGHT : TRACKING_POIS.CHANGE_THEME_DARK);
      }
      return { success: true };
    } catch (error) {
      logger.error('Error updating theme setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * The applicant profile an application letter is written from.
   *
   * The first personal data Fredy has ever held about the user themselves - a user row is a
   * username and a password hash and nothing else - so it lives where every other per-user setting
   * lives, under their own id, and is served back only to the session that owns it.
   *
   * Passing null clears it, matching `/finance-profile`. Fields are not validated individually:
   * every one of them is optional free text the user writes about themselves, and a letter with a
   * blank line is a better outcome than a form that refuses to save.
   */
  fastify.post('/applicant-profile', async (request, reply) => {
    try {
      const saved = await updateUserSettings(callerOf(request), {
        applicantProfile: request.body?.applicant_profile,
      });
      if (!saved.ok) return sendFailure(reply, saved);
      await trackPoi(TRACKING_POIS.APPLICANT_PROFILE_SAVED);
      return { success: true, applicant_profile: saved.changes.applicantProfile };
    } catch (error) {
      logger.error('Error updating applicant profile', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Per-language, per-deal-type overrides of the shipped application letters.
   *
   * Validated against the languages Fredy actually ships, because a template filed under a
   * language no letter is ever written in is a template the user will never see again and will
   * assume was lost. The length cap is the only other rule: these rows sit in the same settings
   * table every request reads, and nothing else in there is user-authored free text.
   */
  fastify.post('/application-templates', async (request, reply) => {
    const userId = request.session.currentUser;
    const { application_templates } = request.body || {};

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    if (application_templates !== null) {
      const problem = validateApplicationTemplates(application_templates);
      if (problem != null) {
        return reply.code(400).send({ error: problem });
      }
    }

    try {
      upsertSettings({ application_templates }, userId);
      await trackPoi(TRACKING_POIS.APPLICATION_TEMPLATE_SAVED);
      return { success: true, application_templates };
    } catch (error) {
      logger.error('Error updating application templates', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Render one draft template against a sample listing, for the editor's live preview.
   *
   * A question, not a change: nothing is stored, and it answers while demo mode is on because
   * there is nothing there to protect.
   *
   * The rendering deliberately happens here rather than in the browser. The frontend may not
   * import out of `lib/`, and even if it could, a second implementation of the placeholder
   * substitution would eventually disagree with this one about the letter the user is about to
   * send - the same reason the finance maths stays server-side.
   *
   * Body: `{ template: string|null, language: string, dealType: 'rent'|'buy' }`. A null template
   * means "show me the shipped letter", which is how the editor seeds its field.
   */
  fastify.post('/application-preview', async (request, reply) => {
    const userId = request.session.currentUser;
    const { template = null, language, dealType } = request.body || {};

    if (!TEMPLATE_LANGUAGES.includes(language)) {
      return reply.code(400).send({ error: `No application letters are written in "${language}".` });
    }
    if (!APPLICATION_DEAL_TYPES.includes(dealType)) {
      return reply.code(400).send({ error: `"${dealType}" is not a deal type.` });
    }
    if (template !== null && typeof template !== 'string') {
      return reply.code(400).send({ error: 'template must be a string or null.' });
    }
    if (typeof template === 'string' && template.length > MAX_APPLICATION_TEMPLATE_LENGTH) {
      return reply
        .code(400)
        .send({ error: `A template may be at most ${MAX_APPLICATION_TEMPLATE_LENGTH} characters long.` });
    }

    try {
      const profile = getUserSettings(userId)?.applicant_profile ?? null;
      return previewApplicationTemplate({ template, language, dealType, profile });
    } catch (error) {
      logger.error('Error rendering an application template preview', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/language', async (request, reply) => {
    try {
      const saved = await updateUserSettings(callerOf(request), { language: request.body?.language });
      if (!saved.ok) return sendFailure(reply, saved);
      await trackPoi(TRACKING_POIS.CHANGE_LANGUAGE);
      return { success: true };
    } catch (error) {
      logger.error('Error updating language setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
