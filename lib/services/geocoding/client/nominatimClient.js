/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import os from 'os';
import crypto from 'crypto';
import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import logger from '../../logger.js';

const API_URL = 'https://nominatim.openstreetmap.org/search';

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
});

const throttle = pThrottle({
  limit: 1,
  interval: 1000,
});

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
 * Nominatim requires a specific User-Agent.
 * Since Fredy is self-hosted, we use a unique machine ID to make it specific.
 */
const userAgent = `Fredy-Self-Hosted (${computeMachineId()}; https://github.com/orangecoding/fredy)`;

let last429 = 0;
const PAUSE_DURATION = 3600000; // 1 hour

/**
 * Geocodes an address using Nominatim.
 *
 * @param {string} address - The address to geocode.
 * @returns {Promise<{lat: number, lng: number}|null>} The geocoordinates or null if error. {lat: -1, lng: -1} if not found.
 */
async function doGeocode(address) {
  if (Date.now() - last429 < PAUSE_DURATION) {
    return null;
  }

  const url = `${API_URL}?q=${encodeURIComponent(address)}&format=json&countrycodes=de`;

  try {
    const response = await fetch(url, {
      agent,
      timeout: 60000,
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (response.status === 429) {
      logger.warn('Nominatim rate limit hit. Pausing for 1 hour.');
      last429 = Date.now();
      return null;
    }

    if (!response.ok) {
      logger.error(`Nominatim API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      };
    }

    return { lat: -1, lng: -1 };
  } catch (error) {
    logger.error('Error during Nominatim geocoding:', error);
    return null;
  }
}

export const geocode = throttle(doGeocode);

export const isPaused = () => Date.now() - last429 < PAUSE_DURATION;
