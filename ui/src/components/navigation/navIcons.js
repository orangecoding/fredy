/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  IconAdmin,
  IconFinance,
  IconListings,
  IconMap,
  IconOverview,
  IconSearches,
  IconSliders,
} from '../icons/StrokeIcons.jsx';

/**
 * The icon each navigation entry carries, keyed by nav key so the tree itself stays free of JSX.
 *
 * One table for the sidebar, the phone's tab bar and its menu, so an entry looks the same wherever
 * it is offered.
 *
 * @type {Record<string, React.ComponentType>}
 */
export const NAV_ICONS = {
  '/dashboard': IconOverview,
  '/listings': IconListings,
  '/map': IconMap,
  '/jobs': IconSearches,
  '/finance': IconFinance,
  '/settings': IconSliders,
  '/admin': IconAdmin,
};
