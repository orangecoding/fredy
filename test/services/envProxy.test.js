/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import net from 'net';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = promisify(execFile);

/**
 * The community API clients and the HTTP notification adapter reach out through the proxy Node is
 * told to use (#535).
 *
 * On a network whose only way out is an HTTP proxy, `NODE_USE_ENV_PROXY=1` points Node's global
 * agents at `HTTPS_PROXY`. A client that built its own `https.Agent` did not inherit that, and
 * neither did the undici dispatcher the HTTP adapter built for self-signed endpoints, so those
 * requests went out directly and were dropped: every Nominatim lookup ended in an AbortError while
 * scraping and the other notifications worked fine.
 *
 * The check spawns `node`, because the switch is read once at process start and the test runner
 * cannot flip it for itself. The proxy here answers every CONNECT with a 502, so nothing leaves the
 * machine; what counts is that the tunnel was asked for at all.
 */
describe('outbound requests honour NODE_USE_ENV_PROXY', () => {
  let proxy;
  let proxyUrl;
  let tunnels;

  beforeAll(async () => {
    proxy = net.createServer((socket) => {
      let head = '';
      socket.on('data', (chunk) => {
        head += chunk.toString('latin1');
        if (!head.includes('\r\n\r\n')) return;
        const [method, target] = head.split('\r\n')[0].split(' ');
        if (method === 'CONNECT') tunnels.push(target);
        socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      });
      socket.on('error', () => {});
    });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => proxy.close(resolve));
  });

  beforeEach(() => {
    tunnels = [];
  });

  // Transitous and Overpass leave the agent out the same way as Nominatim; they read their endpoint
  // from the settings storage, which a bare node process has no database for.
  it.each([
    [
      'Nominatim',
      'lib/services/geocoding/client/nominatimClient.js',
      'geocode',
      ['Alexanderplatz 1, Berlin'],
      'nominatim.openstreetmap.org:443',
    ],
    [
      'Breitbandatlas (DE)',
      'lib/services/connectivity/client/breitbandatlasClient.js',
      'fetchGermanConnectivity',
      [52.52, 13.4],
      'breitbandatlas.gigabit-grundbuch.online:443',
    ],
    [
      'Breitbandatlas (AT)',
      'lib/services/connectivity/client/breitbandatlasAtClient.js',
      'fetchAustrianConnectivity',
      [48.2, 16.37],
      'breitbandatlas.gv.at:443',
    ],
    [
      'geo.admin.ch',
      'lib/services/connectivity/client/geoAdminClient.js',
      'fetchSwissConnectivity',
      [46.95, 7.44],
      'wms.geo.admin.ch:443',
    ],
    [
      'cobertura (ES)',
      'lib/services/connectivity/client/coberturaEsClient.js',
      'fetchSpanishConnectivity',
      [40.42, -3.7],
      'services-eu1.arcgis.com:443',
    ],
    ...[false, true].map((selfSignedCerts) => [
      `HTTP notification adapter (selfSignedCerts: ${selfSignedCerts})`,
      'lib/notification/adapter/http.js',
      'send',
      [
        {
          serviceName: 'test',
          newListings: [],
          notificationConfig: [
            { id: 'http', fields: { endpointUrl: 'https://hooks.fredy.invalid/', selfSignedCerts } },
          ],
          jobKey: 'job',
          baseUrl: '',
        },
      ],
      'hooks.fredy.invalid:443',
    ]),
  ])('%s asks the proxy for a tunnel', async (_name, file, fn, args, target) => {
    const specifier = pathToFileURL(path.join(ROOT, file)).href;
    const script = `
      const client = await import(${JSON.stringify(specifier)});
      await client[${JSON.stringify(fn)}](...${JSON.stringify(args)}).catch(() => {});
    `;

    await run(process.execPath, ['--input-type=module', '-e', script], {
      cwd: ROOT,
      timeout: 30000,
      env: {
        ...process.env,
        NODE_USE_ENV_PROXY: '1',
        HTTPS_PROXY: proxyUrl,
        https_proxy: proxyUrl,
        HTTP_PROXY: proxyUrl,
        http_proxy: proxyUrl,
        NO_PROXY: '',
        no_proxy: '',
      },
    });

    expect(tunnels).toContain(target);
  });
});
