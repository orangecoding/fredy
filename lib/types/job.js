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
 * @property {string[]} [excludedLocations] Case-insensitive address substrings excluded by this job; defaults to [].
 * @property {Array<any>} [provider] Provider configuration list.
 * @property {Object} [notificationAdapter] Notification configuration.
 * @property {Array<string>} [shared_with_user] Users this job is shared with.
 * @property {SpatialFilter | null} [spatialFilter] Optional spatial filter configuration as GeoJSON FeatureCollection.
 * @property {SpecFilter | null} [specFilter] Optional listing specifications.
 * @property {import('../utils/commuteBudget.js').CommuteFilter | null} [commuteFilter] How far this
 *   search is willing to travel from the owner's saved addresses, and what to do about a listing
 *   that is further. Null for every job that has never been given one.
 * @property {import('../utils/marketFilter.js').MarketFilter | null} [marketFilter] How far under the
 *   local median a listing has to be priced, what gross yield a purchase has to reach, and what to do
 *   about a listing that misses. Null for every job that has never been given one.
 * @property {number | null} [priceChangeThreshold] The job's own smallest price change worth a
 *   notification, in percent. Null means the instance setting applies.
 * @property {import('../utils/paging.js').Paging | null} [paging] How many result pages a run reads per
 *   provider and how long it waits between two. Null means one page, which is every job's default.
 * @property {'rent' | 'buy'} [dealType] Whether this job searches for something to rent or to buy.
 *   Decides which half of the user's finance profile applies to its listings.
 * @property {number} [numberOfFoundListings] Count of active listings for this job.
 * @property {number | null} [lastRunAt] Epoch ms at which the job was last triggered, or null if never triggered.
 */

export {};
