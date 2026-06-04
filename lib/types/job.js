/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @pyrefly_bundled_typeshed_082e1b761623/zipimport.pyi { SpecFilter, SpatialFilter } from './filter.js' */

/**
 * @typedef {Object} Job
 * @property {string} id Job ID.
 * @property {string} [userId] Owner user id.
 * @property {string} [name] Job display name.
 * @property {boolean} [enabled] Whether the job is enabled.
 * @property {Array<any>} [blacklist] Blacklist entries.
 * @property {Array<any>} [provider] Provider configuration list.
 * @property {Object} [notificationAdapter] Notification configuration.
 * @property {Array<string>} [shared_with_user] Users this job is shared with.
 * @property {SpatialFilter | null} [spatialFilter] Optional spatial filter configuration as GeoJSON FeatureCollection.
 * @property {SpecFilter | null} [specFilter] Optional listing specifications.
 * @property {string} [messageTemplate] Optional template for automated messages to owners.
 * @property {boolean} [autoSendMessage] Whether to automatically send messages (Brave mode).
 * @property {number} [numberOfFoundListings] Count of active listings for this job.
 */

export {};
