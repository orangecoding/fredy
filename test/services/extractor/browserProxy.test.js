/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchBrowser, closeBrowser } from '../../../lib/services/extractor/puppeteerExtractor.js';

/**
 * The proxy setting against the real browser engine of this machine, not a mock of its SDK.
 *
 * The unit tests can only check what Fredy hands to the SDK. Twice that was not what the browser
 * did: Clearcote ignored the proxy given as a string, and its macOS build dropped the credentials.
 * Both went unnoticed because the mocks agreed with the code. The proxy here runs on localhost and
 * answers every request itself, so nothing leaves the machine.
 */
describe.skipIf(process.env.TEST_MODE === 'offline')('browser proxy, end to end', () => {
  const expectedLogin = `Basic ${Buffer.from('fredy:s3cret').toString('base64')}`;
  const seen = [];
  let proxy;
  let port;

  beforeAll(async () => {
    proxy = http.createServer((request, response) => {
      const login = request.headers['proxy-authorization'] ?? null;
      seen.push({ url: request.url, login });
      if (login !== expectedLogin) {
        response.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="fredy-test"' });
        response.end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<html><body>answered by the proxy</body></html>');
    });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    port = proxy.address().port;
  });

  afterAll(async () => {
    await new Promise((resolve) => proxy.close(resolve));
  });

  it('sends every request through the proxy and logs in with the credentials from the URL', async () => {
    // .invalid never resolves, so the page only loads if the browser really went through the proxy.
    const target = 'http://fredy-proxy-check.invalid/';
    const browser = await launchBrowser(target, { proxyUrl: `http://fredy:s3cret@127.0.0.1:${port}` });
    try {
      const page = await browser.newPage();
      const response = await page.goto(target, { timeout: 30000 });

      expect(response.status()).toBe(200);
      expect(await page.content()).toContain('answered by the proxy');
      expect(seen.some((request) => request.url === target && request.login === expectedLogin)).toBe(true);
    } finally {
      await closeBrowser(browser);
    }
  });
});
