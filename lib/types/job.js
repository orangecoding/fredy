/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/** @import { SpecFilter, SpatialFilter } from './filter.js' */

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
 * @property {SpatialFilter | null} [spatialFilter] Optional spatial filter configuration.
 * @property {SpecFilter | null} [specFilter] Optional listing specifications.
 * @property {number} [numberOfFoundListings] Count of active listings for this job.
 */

export {};
