/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import restana from 'restana';
import fetch from 'node-fetch';
import { getPackageVersion } from '../../utils.js';
import semver from 'semver';

const service = restana();
const versionRouter = service.newRouter();

versionRouter.get('/', async (req, res) => {
  const versionPayload = await getCurrentVersionFromGithub();
  const localFredyVersion = await getPackageVersion();
  res.body =
    versionPayload == null
      ? {
          newVersion: false,
          localFredyVersion,
        }
      : versionPayload;
  res.send();
});

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

export { versionRouter };
