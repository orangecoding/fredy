/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import os from 'os';
import crypto from 'crypto';

/**
 * Derives a stable, anonymous id for this installation from the host's name, platform and MAC
 * addresses. It identifies one self-hosted instance to the community APIs Fredy relies on
 * (Nominatim, Transitous) without carrying anything about the user.
 *
 * @returns {string}
 */
function computeMachineId() {
  const hostname = os.hostname() || 'unknown-host';
  const nets = os.networkInterfaces?.() || {};
  const macs = [];

  for (const ifname of Object.keys(nets)) {
    for (const addr of nets[ifname] || []) {
      if (!addr) continue;
      if (addr.internal) continue;
      if (addr.mac && addr.mac !== '00:00:00:00:00:00') macs.push(addr.mac);
    }
  }

  macs.sort();

  const raw = [hostname, os.platform(), os.arch(), ...macs].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20);
}

/**
 * The User-Agent Fredy sends to the free community APIs it uses. Nominatim requires a specific one
 * and Transitous asks for the same courtesy; since Fredy is self-hosted, the machine id makes each
 * instance distinguishable so a single misbehaving installation can be blocked instead of all.
 */
export const selfHostedUserAgent = `Fredy-Self-Hosted (${computeMachineId()}; https://github.com/orangecoding/fredy)`;
