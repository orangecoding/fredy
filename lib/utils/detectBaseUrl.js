/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import os from 'os';
import fs from 'fs';

const DOCKER_BRIDGE_PREFIXES = ['172.17.', '172.18.', '172.19.', '172.20.'];

export function isRunningInDocker() {
  if (process.env.FREDY_DOCKER === '1') return true;
  try {
    fs.accessSync('/.dockerenv');
    return true;
  } catch {
    /* not docker */
  }
  try {
    const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
    return /docker|containerd|kubepods/.test(cgroup);
  } catch {
    return false;
  }
}

function isDockerBridgeIp(addr) {
  return DOCKER_BRIDGE_PREFIXES.some((prefix) => addr.startsWith(prefix));
}

export function detectLocalIp() {
  if (isRunningInDocker()) {
    return process.env.FREDY_HOST_IP ?? '172.17.0.1';
  }
  const ifaces = os.networkInterfaces();
  for (const preferred of ['en0', 'eth0', 'wlan0', 'ens3', 'ens18']) {
    for (const entry of ifaces[preferred] ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && !isDockerBridgeIp(entry.address)) {
        return entry.address;
      }
    }
  }
  for (const iface of Object.values(ifaces)) {
    for (const entry of iface ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && !isDockerBridgeIp(entry.address)) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

export function guessBaseUrl(port) {
  return `http://${detectLocalIp()}:${port}`;
}
