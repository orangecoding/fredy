/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fetch from 'node-fetch';
import { getPackageVersion } from '../../utils.js';
import semver from 'semver';

async function getCurrentVersionFromGithub() {
  const raw = await fetch('https://api.github.com/repos/orangecoding/fredy/releases/latest');
  const data = await raw.json();
  const localFredyVersion = await getPackageVersion();
  if (data.tag_name == null || semver.gte(localFredyVersion, data.tag_name)) {
    return null;
  }
  return {
    newVersion: true,
    version: data.tag_name,
    url: data.html_url,
    body: data.body,
    localFredyVersion,
  };
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function versionPlugin(fastify) {
  fastify.get('/', async () => {
    const versionPayload = await getCurrentVersionFromGithub();
    const localFredyVersion = await getPackageVersion();
    return versionPayload ?? { newVersion: false, localFredyVersion };
  });
}
