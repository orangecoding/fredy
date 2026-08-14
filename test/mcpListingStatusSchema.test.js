/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { LISTING_STATUS_FILTER_SCHEMA } from '../lib/mcp/mcpAdapter.js';

describe('MCP listing status filter schema', () => {
  it.each(['applied', 'invited', 'visited', 'documents_sent', 'accepted', 'rejected', 'not_invited', 'none'])(
    'accepts %s',
    (status) => {
      expect(LISTING_STATUS_FILTER_SCHEMA.parse(status)).toBe(status);
    },
  );

  it('rejects unknown statuses', () => {
    expect(LISTING_STATUS_FILTER_SCHEMA.safeParse('maybe').success).toBe(false);
  });
});
