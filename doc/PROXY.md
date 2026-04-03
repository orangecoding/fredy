# Proxy Configuration

Fredy supports routing all scraping traffic (both HTTP requests and Puppeteer browser sessions) through an HTTP proxy. This is useful when providers block direct requests or when running Fredy behind a corporate firewall.

> **Note:** Only scraping requests are proxied. Notifications (Telegram, Slack, email, etc.), geocoding, and analytics are **not** affected.

---

## Configuring the Proxy

### Via Web UI

Open Fredy's Web UI and navigate to **General Settings → Network** tab. Enter the proxy URL in the **Proxy URL** field.

Supported formats:

```
http://proxy.example.com:8080
http://username:password@proxy.example.com:8080
https://proxy.example.com:8443
```

Examples using common proxy providers:

| Provider | Proxy URL |
|----------|-----------|
| iProyal | `http://customer-user:pass_country-de@geo.iproyal.com:12321` |
| Bright Data | `http://lum-customer-C1234-zone-zone1:pass@brd.superproxy.io:22225` |
| Self-hosted (no auth) | `http://192.168.1.50:3128` |

After saving, Fredy immediately uses the new proxy for all subsequent scraping runs — no restart required.

### Via Environment Variables

If no proxy URL is set in the Web UI, Fredy checks the following environment variables (in order):

1. `FREDY_PROXY_URL`
2. `HTTPS_PROXY`
3. `HTTP_PROXY`

#### Docker

```bash
docker run -d --name fredy \
  -e FREDY_PROXY_URL=http://user:pass@proxy.example.com:8080 \
  -v fredy_conf:/conf \
  -v fredy_db:/db \
  -p 9998:9998 \
  ghcr.io/orangecoding/fredy:master
```

#### Node.js

```bash
FREDY_PROXY_URL=http://user:pass@proxy.example.com:8080 yarn run start:backend
```

### Priority

When multiple sources are configured, the proxy URL is resolved in this order:

1. **Web UI setting** (highest priority)
2. `FREDY_PROXY_URL` env var
3. `HTTPS_PROXY` env var
4. `HTTP_PROXY` env var (lowest priority)

---

## How It Works

Fredy has two outbound scraping paths, and both respect the proxy configuration:

| Path | Used by | Mechanism |
|------|---------|-----------|
| **HTTP fetch** | immoscout (mobile API) | `undici.ProxyAgent` passed as `dispatcher` to `fetch()` |
| **Puppeteer** | All other providers | Chrome launched with `--proxy-server` flag; credentials passed via `page.authenticate()` |

When the proxy URL includes credentials (`username:password@`), authentication is handled automatically — via a `Basic` auth header for HTTP requests, and via Chrome's built-in proxy auth for Puppeteer.

---

## Testing Providers with a Proxy

Provider tests are integration tests that hit real external websites. Some sites block direct requests, so running them through a proxy can improve reliability.

### Setup

1. Copy the example env file and add your proxy credentials:

   ```bash
   cp .env.test.example .env.test
   ```

2. Edit `.env.test` and set `FREDY_PROXY_URL`:

   ```
   FREDY_PROXY_URL=http://user:pass@proxy.example.com:8080
   ```

   `.env.test` is gitignored and will not be committed.

### Running Tests

```bash
# Provider tests without proxy (direct connection)
yarn test:provider

# Provider tests with proxy (loads variables from .env.test)
yarn test:provider:proxy
```

Both commands use a dedicated vitest config (`vitest.provider.config.js`) that runs only the provider integration tests.

### What Gets Tested

| Script | HTTP providers (immoscout) | Puppeteer providers (11 others) |
|--------|---------------------------|--------------------------------|
| `yarn test:provider` | Direct fetch | Direct browser launch |
| `yarn test:provider:proxy` | Fetch via proxy | Browser with `--proxy-server` |

### Notes

- Provider tests are **excluded from CI** (`yarn testGH`) because they depend on external sites that may be unavailable or rate-limited.
- Some providers may still fail even with a proxy due to bot detection or changed page structure — this is expected for integration tests against live websites.
- The full unit test suite (`yarn test`) does not require a proxy and should always pass.
