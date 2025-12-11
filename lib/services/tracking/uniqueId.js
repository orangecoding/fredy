/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { hostname, arch, cpus, platform } from 'os';
import { createHash } from 'crypto';

/**
 * Don't worry, we are not evil ;) We however need a unique id per running instance
 * @returns {string}
 */
export const getUniqueId = () => {
  const systemInfo = {
    hostname: hostname(),
    architecture: arch(),
    cpuCount: cpus().length,
    platform: platform(),
  };

  const baseData = JSON.stringify(systemInfo);

  return createHash('sha256').update(baseData).digest('hex');
};
