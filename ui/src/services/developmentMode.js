/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export default function isDevelopmentMode() {
  const inDevMode = import.meta.env.MODE;
  return inDevMode != null && inDevMode === 'development';
}
