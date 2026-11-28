/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  IconActivity,
  IconAdmin,
  IconArchive,
  IconBell,
  IconBug,
  IconChip,
  IconClock,
  IconDocument,
  IconPalette,
  IconPlug,
  IconRoute,
  IconSend,
  IconUsers,
  IconWifi,
} from '../../components/icons/StrokeIcons.jsx';

/**
 * The icon of each settings page, by the name `settingsPages.js` gives it.
 *
 * Shared by the column beside the pages on a wide screen and the list a phone shows instead, so a
 * page is drawn with the same shape in both.
 *
 * @type {Record<string, React.ComponentType>}
 */
export const SETTINGS_PAGE_ICONS = {
  preferences: IconPalette,
  travelTime: IconClock,
  listingDetails: IconDocument,
  application: IconSend,
  notifications: IconBell,
  connections: IconPlug,
  mcpServer: IconChip,
  system: IconAdmin,
  execution: IconActivity,
  routing: IconRoute,
  connectivity: IconWifi,
  users: IconUsers,
  backup: IconArchive,
  debug: IconBug,
};
