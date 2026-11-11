/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { usesClearcote } from '../../../lib/services/extractor/browserEngine.js';

describe('usesClearcote', () => {
  it.each([
    ['linux', 'x64'],
    ['win32', 'x64'],
    ['darwin', 'arm64'],
  ])('drives Clearcote on %s %s, where its open build is published', (platform, arch) => {
    expect(usesClearcote(platform, arch)).toBe(true);
  });

  it.each([
    ['linux', 'arm64'],
    ['darwin', 'x64'],
    ['win32', 'arm64'],
    ['freebsd', 'x64'],
  ])('falls back to CloakBrowser on %s %s, which Clearcote does not build for', (platform, arch) => {
    expect(usesClearcote(platform, arch)).toBe(false);
  });
});
