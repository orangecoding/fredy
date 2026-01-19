/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

export function transform({ name, id, enabled, url }) {
  return {
    name,
    id,
    enabled,
    url,
  };
}
