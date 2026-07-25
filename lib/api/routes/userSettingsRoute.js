/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getSettings, getUserSettings, upsertSettings } from '../../services/storage/settingsStorage.js';
import { isAdmin } from '../security.js';
import { geocodeAddress } from '../../services/geocoding/geoCodingService.js';
import { autocompleteAddress } from '../../services/geocoding/autocompleteService.js';
import { updateDistancesForAddressChange } from '../../services/geocoding/distanceService.js';
import { trackPoi } from '../../services/tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';
import logger from '../../services/logger.js';
import { runGeoCordTask } from '../../services/crons/geocoding-cron.js';

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
      const entries = (home_addresses || []).filter((a) => a && a.address);
      if (entries.length === 0) {
        upsertSettings({ home_addresses: null }, userId);
        updateDistancesForAddressChange(userId, []);
        return { success: true, home_addresses: [] };
      }

      await trackPoi(TRACKING_POIS.DISTANCE_ADDRESS_ENTERED);
      const geocoded = [];
      for (const { label, address } of entries) {
        const coords = (await geocodeAddress(address)) || { lat: -1, lng: -1 };
        geocoded.push({ label: label || address, address, coords });
      }

      upsertSettings({ home_addresses: geocoded }, userId);
      updateDistancesForAddressChange(userId, geocoded);
      runGeoCordTask();
      return { success: true, home_addresses: geocoded };
    } catch (error) {
      logger.error('Error updating addresses settings', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/news-hash', async (request, reply) => {
    const userId = request.session.currentUser;
    const { news_hash } = request.body;

    const globalSettings = await getSettings();
    if (globalSettings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change settings.' });
    }

    try {
      upsertSettings({ news_hash }, userId);
      return { success: true };
    } catch (error) {
      logger.error('Error updating news hash', error);
      return reply.code(500).send({ error: error.message });
    }
  });

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
      return { success: true };
    } catch (error) {
      logger.error('Error updating finance profile', error);
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
