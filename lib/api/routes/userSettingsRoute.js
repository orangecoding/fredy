/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getAddresses, getSettings, getUserSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import { geocodeAddress } from '../../services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../services/geocoding/autocompleteService.js';
import { updateDistancesForAddressChange } from '../../services/geocoding/distanceService.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import { runGeoCordTask } from '../../services/crons/geocoding-cron.js';
import { mergeSection, stripSection } from '../../services/finance/profileSections.js';

/**
 * Validates the time of day a travel time should be measured at.
 *
 * A commute is a question about a moment: the ride to the office at eight and the ride home at half
 * past five are not the same journey. The day is not asked for - it is always the next working day,
 * because choosing between Tuesday and Wednesday is a question with no useful answer.
 *
 * Anything unparseable is dropped rather than corrected, so a malformed body leaves the address on
 * the default instead of silently landing on some other departure.
 *
 * @param {unknown} departure
 * @returns {{time: string}|null}
 */
function normalizeDeparture(departure) {
  if (departure == null || typeof departure !== 'object') {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(departure.time ?? '').trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    return null;
  }
  return { time: `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` };
}

/**
 * How an address wants to be measured.
 *
 * Public transport is the default, and not only because it is the common answer: it is the one
 * Fredy can work out for every listing from a single request per address. The street modes need a
 * routing per listing, so choosing one is choosing a slower fill-in - which the settings page says
 * out loud rather than leaving to be discovered.
 *
 * @param {unknown} mode
 * @returns {'transit'|'car'|'bike'|'walk'}
 */
function normalizeMode(mode) {
  const value = String(mode ?? '').toLowerCase();
  return ['car', 'bike', 'walk'].includes(value) ? value : 'transit';
}

/**
 * The routing-relevant shape of an address list.
 *
 * Saving addresses recomputes every stored distance and puts every listing back in front of the
 * travel-time sweeper, which is right when a place moves and pointless when it does not: re-saving
 * an untouched form, or correcting a typo in a label that was already unique, should cost nothing.
 * The label is in here because travel times and distances are both stored under it, so renaming an
 * address really does invalidate them.
 *
 * @param {Array<import('../../types/listing.js').Address>} addresses
 * @returns {string}
 */
function routingSignature(addresses) {
  return JSON.stringify(
    (addresses ?? []).map((a) => [a?.label, a?.coords?.lat, a?.coords?.lng, a?.mode, a?.departure?.time ?? null]),
  );
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function userSettingsPlugin(fastify) {
  fastify.get('/', async (request) => {
    const userId = request.session.currentUser;
    return getUserSettings(userId);
  });

  fastify.get('/autocomplete', async (request, reply) => {
    const { q } = request.query;
    try {
      const results = await autocompleteAddress(q);
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
      const coordinates = await geocodeAddress(q.trim());
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

  fastify.post('/home-address', async (request, reply) => {
    const userId = request.session.currentUser;
    const { home_addresses } = request.body;
    const settings = await getSettings();

    if (settings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change the addresses.' });
    }

    if (home_addresses != null && !Array.isArray(home_addresses)) {
      return reply.code(400).send({ error: 'home_addresses must be an array.' });
    }

    try {
      const previousSignature = routingSignature(getAddresses(getUserSettings(userId)));
      const entries = (home_addresses || []).filter((a) => a && a.address);
      // Travel times are stored per label, so two addresses sharing one would overwrite each other
      // and quietly lose a commute. Rejected here rather than deduplicated further down, where the
      // user would have no idea which of their two "Home" entries survived.
      const labels = entries.map((a) =>
        String(a.label || a.address)
          .trim()
          .toLowerCase(),
      );
      if (new Set(labels).size !== labels.length) {
        return reply.code(400).send({ error: 'Each address needs its own name.' });
      }
      if (entries.length === 0) {
        upsertSettings({ home_addresses: null }, userId);
        if (previousSignature !== routingSignature([])) {
          updateDistancesForAddressChange(userId, []);
        }
        return { success: true, home_addresses: [] };
      }

      await trackPoi(TRACKING_POIS.DISTANCE_ADDRESS_ENTERED);
      const geocoded = [];
      for (const { label, address, departure, mode } of entries) {
        const coords = (await geocodeAddress(address)) || { lat: -1, lng: -1 };
        const entry = { label: label || address, address, coords, mode: normalizeMode(mode) };
        // Only stored when it is actually set to something valid. An absent departure reads as the
        // default everywhere, so writing one out would only be a copy of that default that stops
        // following it when the default changes.
        const normalizedDeparture = normalizeDeparture(departure);
        if (normalizedDeparture != null) {
          entry.departure = normalizedDeparture;
        }
        geocoded.push(entry);
      }

      upsertSettings({ home_addresses: geocoded }, userId);
      // Only when a place, a mode or a departure actually moved. Re-queueing every listing in the
      // database for the travel-time sweeper because somebody opened the form and pressed Save would
      // be an expensive way to achieve nothing.
      if (previousSignature !== routingSignature(geocoded)) {
        updateDistancesForAddressChange(userId, geocoded);
      }
      // Deliberately outside that guard. This fills in the coordinates of listings that have none,
      // which has nothing to do with whether an address moved, and pressing Save on an unchanged
      // form is the only way anybody currently has to retry a geocode that failed. Issue #418 is
      // somebody discovering exactly that, so putting it behind the guard would take away the one
      // remedy they found. It is a no-op while a sweep is already running.
      runGeoCordTask();
      return { success: true, home_addresses: geocoded };
    } catch (error) {
      logger.error('Error updating addresses settings', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Remember the newest release someone has been shown the news for.
   *
   * Replaces `/news-hash`, which stored a hash of whatever news.json held at the time: skip a
   * release and its hash was never stored, so its news was never shown again either. A version
   * marker answers "what have you already been told about" instead of "did you dismiss this exact
   * payload", which is the question that actually matters across upgrades.
   */
  fastify.post('/news-last-seen-version', async (request, reply) => {
    const userId = request.session.currentUser;
    const { news_last_seen_version } = request.body || {};

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    // Loose on purpose - the browser sends back a version string this build shipped - but bounded,
    // so a scripted client cannot grow the row.
    if (typeof news_last_seen_version !== 'string' || news_last_seen_version.length > 64) {
      return reply.code(400).send({ error: 'news_last_seen_version must be a string of at most 64 characters.' });
    }

    try {
      upsertSettings({ news_last_seen_version }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating the last seen news version', error);
      return reply.code(500).send({ error: error.message });
    }
  });

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
    const userId = request.session.currentUser;
    const { finance_profile } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    // Passing null is how the user clears their profile, which also hides every
    // finance surface again (the affordability filter, the chips, the detail card).
    if (finance_profile !== null && (typeof finance_profile !== 'object' || Array.isArray(finance_profile))) {
      return reply.code(400).send({ error: 'finance_profile must be an object or null.' });
    }

    try {
      upsertSettings({ finance_profile }, userId);
      return { success: true, finance_profile };
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

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }
    if (section !== 'rent' && section !== 'buy') {
      return reply.code(400).send({ error: 'section must be "rent" or "buy".' });
    }
    if (!remove && (profile == null || typeof profile !== 'object' || Array.isArray(profile))) {
      return reply.code(400).send({ error: 'profile must be an object when saving a section.' });
    }

    try {
      const stored = getUserSettings(userId)?.finance_profile ?? null;
      const next = remove ? stripSection(stored, section) : mergeSection(stored, section, profile);
      upsertSettings({ finance_profile: next }, userId);
      return { success: true, finance_profile: next };
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
    const userId = request.session.currentUser;
    const { theme } = request.body;

    if (theme !== 'dark' && theme !== 'light') {
      return reply.code(400).send({ error: "theme must be either 'dark' or 'light'." });
    }

    try {
      // Read before the write, so it still holds what the user was looking at a moment ago. An
      // account that has never picked one is on the default, which is what `?? 'dark'` says: a
      // first-ever save of `dark` changes nothing on screen and is not somebody switching theme.
      const previous = getUserSettings(userId).theme ?? 'dark';
      upsertSettings({ theme }, userId);
      if (theme !== previous) {
        await trackPoi(theme === 'light' ? TRACKING_POIS.CHANGE_THEME_LIGHT : TRACKING_POIS.CHANGE_THEME_DARK);
      }
      return { success: true };
    } catch (error) {
      logger.error('Error updating theme setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/language', async (request, reply) => {
    const userId = request.session.currentUser;
    const { language } = request.body;

    if (typeof language !== 'string' || language.trim() === '') {
      return reply.code(400).send({ error: 'language must be a non-empty string.' });
    }

    try {
      upsertSettings({ language }, userId);
      await trackPoi(TRACKING_POIS.CHANGE_LANGUAGE);
      return { success: true };
    } catch (error) {
      logger.error('Error updating language setting', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
