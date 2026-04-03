/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.js';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['test/provider/!(utils).test.js'],
    },
  }),
);
