/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/* eslint-disable no-console */

/*
 * Authorised capacity test for lagecheck.com.
 *
 * Purpose: find out whether lagecheck.com survives the traffic the Fredy detail-page link will
 * send it, by replaying that traffic - one request at a time, from a German coordinate, at a human
 * cadence - until you stop it with Ctrl+C.
 *
 * Only run this against a target whose operator has agreed to it. It identifies itself in the
 * User-Agent so their side can see what the load is and switch it off from their end if they need
 * to. It is a load generator, nothing about it tries to get past a defence the operator has not
 * agreed to lift.
 *
 * On the proxy: the point is that the requests do not all originate from one server IP, so the test
 * resembles many users rather than one machine. Tor works (point PROXY_URL at its HTTPTunnelPort),
 * but it is the weakest choice for this - exit nodes are slow, variable and frequently already
 * rate-limited, so the latency you measure is Tor's and not lagecheck's, and sustained load traffic
 * is exactly what the Tor network asks people not to send through it. A small SOCKS/HTTP proxy pool,
 * or a distributed load-test service (k6 Cloud, Locust workers), gives both cleaner numbers and a
 * truer picture of "many users from many IPs". PROXY_URL is deliberately required: with no proxy the
 * script refuses to start rather than quietly hammering the target from your server's own address.
 *
 * Setup for the Tor path (torrc):
 *   HTTPTunnelPort 9080
 *   ControlPort 9051                       # only if you want circuit rotation
 *   HashedControlPassword <hash>           # `tor --hash-password <pw>`, then set TOR_CONTROL_PASSWORD
 *
 * Run:
 *   node tools/lagecheckLoadTest.js
 */

import { fetch, ProxyAgent } from 'undici';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// Configuration - everything meant to be changed lives here.
// ---------------------------------------------------------------------------

/**
 * Egress proxy every request goes through, so the traffic does not carry your server's IP. Point it
 * at Tor's HTTPTunnelPort, or at a proxy pool. An HTTP(S) CONNECT proxy - `http://host:port` - is
 * what undici's ProxyAgent speaks; Tor exposes exactly that as HTTPTunnelPort. Required.
 */
const PROXY_URL = 'http://127.0.0.1:9080';

/** The endpoint under test. lat and lng are appended per request. */
const TARGET_URL = 'https://lagecheck.com/check';

/** Pause between requests, uniformly random in this range. Real clicks do not arrive on a metronome. */
const MIN_DELAY_MS = 4444;
const MAX_DELAY_MS = 7777;

/** How long one request may take before it is counted as a timeout rather than waited on forever. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Stop after this many requests. 0 means run until Ctrl+C, which is the default the task asked for. */
const MAX_REQUESTS = 0;

/**
 * Rotate the Tor circuit (a fresh exit IP) every N requests, 0 to never rotate. Needs a ControlPort
 * and, if you set one, TOR_CONTROL_PASSWORD. Ignored when the proxy is not Tor - a plain proxy pool
 * varies the IP on its own.
 */
const ROTATE_CIRCUIT_EVERY = 0;
const TOR_CONTROL_HOST = '127.0.0.1';
const TOR_CONTROL_PORT = 9051;
const TOR_CONTROL_PASSWORD = '';

/** Confirm at startup that the proxy really carries traffic and that the exit IP is not the direct one. */
const VERIFY_EGRESS_IP = true;

/** Print the egress IP each request left from at the end of its line. */
const SHOW_EGRESS_IP = true;

/**
 * How often to re-check that egress IP, in requests, on top of the check at startup and after every
 * circuit rotation.
 *
 * The client cannot see Tor's exit IP directly - the only way to learn it is to ask an echo service
 * through the same proxy, which costs one extra request per lookup. 0 relies on the startup and
 * post-rotation checks: right for a run that does not rotate (the exit is stable, so the same IP is
 * correct on every line) or one that rotates on a fixed cadence (the IP is refreshed exactly when it
 * changes). Set it to 1 to look the IP up before every ping.
 *
 * Whatever the frequency, the printed IP is what the echo service saw. Tor may route the echo call
 * and the lagecheck call over different circuits, so within a rotation it is the exit for this
 * window, not a guarantee of the exact IP lagecheck recorded for that one request.
 */
const IP_REFRESH_EVERY = 1;

/** How often to print a running summary, in requests. */
const SUMMARY_EVERY = 25;

/**
 * Germany's bounding box. Points are drawn uniformly inside it, so a few land in the North Sea or
 * just across a border - which is fine, the endpoint still has to answer, and this is a load test
 * rather than a geocoding one.
 */
const GERMANY_BOUNDS = { minLat: 47.27, maxLat: 55.06, minLng: 5.87, maxLng: 15.04 };

/** Rotated per request so the load looks like a spread of browsers rather than one script. */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
];

// ---------------------------------------------------------------------------
// Implementation.
// ---------------------------------------------------------------------------

/** @returns {number} A uniform integer in [min, max]. */
const randomInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

/** @returns {number} A uniform float in [min, max]. */
const randomFloat = (min, max) => min + Math.random() * (max - min);

/** @returns {T} A random element. @template T @param {T[]} items */
const pick = (items) => items[Math.floor(Math.random() * items.length)];

/** @returns {{lat: number, lng: number}} A random point inside {@link GERMANY_BOUNDS}, 5 decimals. */
function randomGermanCoordinate() {
  return {
    lat: Number(randomFloat(GERMANY_BOUNDS.minLat, GERMANY_BOUNDS.maxLat).toFixed(5)),
    lng: Number(randomFloat(GERMANY_BOUNDS.minLng, GERMANY_BOUNDS.maxLng).toFixed(5)),
  };
}

/**
 * A fresh proxy dispatcher for one request, closed by the caller afterwards.
 *
 * Deliberately not one shared, kept-alive agent: undici would then hold the tunnel open, and one
 * open tunnel is one Tor stream on one circuit, which stays pinned to a single exit no matter what
 * MaxCircuitDirtiness says. A new connection per request lets Tor hand the stream to a fresh circuit
 * once the current one is dirty, so the exit IP actually moves over a run.
 *
 * @returns {import('undici').ProxyAgent}
 */
function newProxyAgent() {
  return new ProxyAgent(PROXY_URL);
}

/**
 * undici reports every connection problem as a bare "fetch failed" and hides the reason that names
 * it in error.cause. Without unwrapping, a refused proxy and an unresolvable host read identically.
 *
 * @param {any} error
 * @returns {string}
 */
function describeError(error) {
  const cause = error?.cause;
  if (!cause) return error?.message || 'unknown';
  const detail = cause.code || cause.message;
  return detail ? `${error.message} (${detail})` : error.message;
}

/**
 * One request through the proxy, timed, never throwing.
 *
 * @param {{lat: number, lng: number}} coordinate
 * @returns {Promise<{status: number|null, ms: number, error: string|null}>}
 */
async function probe(coordinate) {
  const url = `${TARGET_URL}?lat=${coordinate.lat}&lng=${coordinate.lng}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const agent = newProxyAgent();
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      dispatcher: agent,
      signal: controller.signal,
      headers: {
        'user-agent': `${pick(USER_AGENTS)}`,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'de-DE,de;q=0.9',
      },
    });
    // Drain the body so the connection is freed rather than left half-read for the next request.
    await response.arrayBuffer().catch(() => {});
    return { status: response.status, ms: performance.now() - startedAt, error: null };
  } catch (error) {
    return { status: null, ms: performance.now() - startedAt, error: describeError(error) };
  } finally {
    clearTimeout(timer);
    await agent.close().catch(() => {});
  }
}

/**
 * Ask Tor for a fresh circuit over the control port. Best effort: a failure here is logged and the
 * run continues on the current circuit rather than stopping the test.
 *
 * @returns {Promise<void>}
 */
function rotateCircuit() {
  return new Promise((resolve) => {
    const socket = net.connect(TOR_CONTROL_PORT, TOR_CONTROL_HOST);
    let buffer = '';
    const done = (note) => {
      if (note) console.warn(`  circuit rotation: ${note}`);
      socket.destroy();
      resolve();
    };

    socket.setTimeout(5000);
    socket.on('timeout', () => done('control port timed out'));
    socket.on('error', (error) => done(describeError(error)));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('250 OK') && buffer.includes('NEWNYM')) return done(null);
      if (/^5\d\d/m.test(buffer)) return done(`Tor refused (${buffer.trim().split('\n').pop()})`);
    });
    socket.on('connect', () => {
      socket.write(`AUTHENTICATE "${TOR_CONTROL_PASSWORD}"\r\n`);
      socket.write('SIGNAL NEWNYM\r\n');
      socket.write('QUIT\r\n');
    });
  });
}

const IP_LOOKUPS = [
  { url: 'https://api.ipify.org?format=json', parse: (body) => JSON.parse(body).ip },
  { url: 'https://icanhazip.com', parse: (body) => body.trim() },
  { url: 'https://ifconfig.me/ip', parse: (body) => body.trim() },
];

/**
 * The IP a request currently leaves from, looked up the same way the probe travels (through the
 * proxy) or directly, so the two can be compared and the proxy proven to actually change it.
 *
 * @param {boolean} throughProxy
 * @returns {Promise<string|null>}
 */
async function resolveEgressIp(throughProxy) {
  // Fresh agent, same reason as the probe: a pooled connection would pin the lookup to one circuit
  // and report the same exit forever even as the real one moves.
  const agent = throughProxy ? newProxyAgent() : null;
  try {
    for (const { url, parse } of IP_LOOKUPS) {
      try {
        const response = await fetch(url, agent ? { dispatcher: agent } : {});
        if (!response.ok) continue;
        const ip = parse(await response.text());
        if (ip) return ip;
      } catch {
        // Try the next service; only all of them failing is a real problem, handled by the null return.
      }
    }
    return null;
  } finally {
    if (agent) await agent.close().catch(() => {});
  }
}

/** Running tally, printed on every summary and once more on shutdown. */
const stats = { sent: 0, ok: 0, nonOk: 0, failed: 0, statusCounts: new Map(), latencies: [] };

/**
 * The last egress IP an echo service reported through the proxy. Held here rather than looked up per
 * line so a stable circuit is not re-queried on every request; refreshed on the schedule
 * {@link IP_REFRESH_EVERY} sets and after every rotation. Null until the first successful lookup.
 * @type {string|null}
 */
let currentEgressIp = null;

/** Refresh {@link currentEgressIp}, keeping the previous value if the lookup fails. @returns {Promise<void>} */
async function refreshEgressIp() {
  currentEgressIp = (await resolveEgressIp(true)) ?? currentEgressIp;
}

/** @param {number[]} values @param {number} p @returns {number} The p-th percentile, 0..100. */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}

function printSummary() {
  const { sent, ok, nonOk, failed, latencies } = stats;
  const codes = [...stats.statusCounts.entries()].sort((a, b) => a[0] - b[0]).map(([code, n]) => `${code}:${n}`);
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  console.log(
    `\n── summary ──────────────────────────────────────────\n` +
      `  sent ${sent} | 200 ${ok} | other ${nonOk} | failed ${failed}\n` +
      `  status codes: ${codes.join(' ') || '-'}\n` +
      `  latency ms: avg ${avg} p50 ${percentile(latencies, 50)} p95 ${percentile(latencies, 95)} max ${Math.round(Math.max(0, ...latencies))}\n` +
      `─────────────────────────────────────────────────────`,
  );
}

let running = true;

async function main() {
  if (!PROXY_URL) {
    console.error('PROXY_URL is empty. Refusing to run so the load never leaves your server IP directly.');
    process.exit(1);
  }

  console.log(`Target      : ${TARGET_URL}`);
  console.log(`Proxy       : ${PROXY_URL}`);
  console.log(`Delay       : ${MIN_DELAY_MS}-${MAX_DELAY_MS} ms, one request at a time`);
  console.log(`Stop        : Ctrl+C${MAX_REQUESTS ? `, or after ${MAX_REQUESTS} requests` : ''}`);

  if (VERIFY_EGRESS_IP) {
    const [direct, proxied] = await Promise.all([resolveEgressIp(false), resolveEgressIp(true)]);
    console.log(`Direct IP   : ${direct ?? 'unknown'}`);
    console.log(`Proxy IP    : ${proxied ?? 'unknown'}`);
    if (proxied == null) {
      console.error(
        '\nThe proxy did not answer an IP lookup, so it is not carrying traffic. Fix the proxy before load testing.',
      );
      process.exit(1);
    }
    if (direct && proxied && direct === proxied) {
      console.error(
        '\nProxy IP equals the direct IP - traffic is NOT going through the proxy. Aborting to avoid testing from your own address.',
      );
      process.exit(1);
    }
    // The verify lookup already went through the proxy, so it seeds the per-line IP for free.
    currentEgressIp = proxied;
  }

  // Seed it when the verify step is off, so the first lines have an IP rather than a placeholder.
  if (SHOW_EGRESS_IP && currentEgressIp == null) {
    await refreshEgressIp();
  }

  console.log('\nStarting. Press Ctrl+C to stop.\n');

  while (running && (MAX_REQUESTS === 0 || stats.sent < MAX_REQUESTS)) {
    // Before the request, so the IP printed on this line is the one this request leaves from.
    if (SHOW_EGRESS_IP && IP_REFRESH_EVERY > 0 && stats.sent % IP_REFRESH_EVERY === 0) {
      await refreshEgressIp();
    }

    const coordinate = randomGermanCoordinate();
    const result = await probe(coordinate);

    stats.sent += 1;
    stats.latencies.push(result.ms);
    if (result.status === 200) stats.ok += 1;
    else if (result.status != null) stats.nonOk += 1;
    else stats.failed += 1;
    if (result.status != null) stats.statusCounts.set(result.status, (stats.statusCounts.get(result.status) ?? 0) + 1);

    const when = new Date().toISOString().slice(11, 19);
    const outcome = result.status != null ? `HTTP ${result.status}` : `ERR  ${result.error}`;
    const via = SHOW_EGRESS_IP ? ` via ${currentEgressIp ?? '?'}` : '';
    console.log(
      `[${when}] #${stats.sent} ${coordinate.lat},${coordinate.lng} → ${outcome} (${Math.round(result.ms)} ms)${via}`,
    );

    if (stats.sent % SUMMARY_EVERY === 0) printSummary();

    if (ROTATE_CIRCUIT_EVERY > 0 && stats.sent % ROTATE_CIRCUIT_EVERY === 0) {
      await rotateCircuit();
      // The new circuit means a new exit, so the cached IP is stale until the next request refreshes it.
      if (SHOW_EGRESS_IP) await refreshEgressIp();
    }

    if (!running) break;
    if (MAX_REQUESTS !== 0 && stats.sent >= MAX_REQUESTS) break;
    await sleep(randomInt(MIN_DELAY_MS, MAX_DELAY_MS));
  }

  printSummary();
}

// A first Ctrl+C stops the loop and prints the final summary; a second one, if the in-flight request
// is hanging, exits hard.
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) process.exit(130);
    stopping = true;
    running = false;
    console.log('\nStopping after the current request…');
  });
}

main().catch((error) => {
  console.error('Load test aborted:', describeError(error));
  process.exit(1);
});
