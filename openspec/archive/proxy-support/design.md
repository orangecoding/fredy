# Design: Native Proxy Support

## Architecture

Central HTTP client (`lib/services/http/httpClient.js`) sits between providers/services and the network layer.

```
┌──────────────────────────────────────────────────┐
│                  httpClient.js                    │
│  scrapingFetch(url, opts)  — all scraping calls   │
│  getProxyConfig()          — for Puppeteer        │
│  parseProxyUrl() / clearProxyCache()              │
├──────────────────────────────────────────────────┤
│  Settings → ProxyAgent caching → native fetch()   │
│  Env fallback: FREDY_PROXY_URL > HTTPS_PROXY >   │
│  HTTP_PROXY                                       │
└──────────┬──────────────────────┬────────────────┘
           │                      │
    ┌──────┴──────┐        ┌──────┴──────┐
    │ Fetch-based │        │  Puppeteer  │
    │ (ImmoScout, │        │ (Immowelt,  │
    │  listing    │        │  Kleinanz., │
    │  tester)    │        │  WG-Gesucht)│
    └─────────────┘        └─────────────┘
```

## Key Decisions

### Use `undici.ProxyAgent` (no third-party proxy libs)
Node.js 22 bundles undici. Using its `ProxyAgent` as `dispatcher` for native `fetch()` avoids all third-party proxy libraries. Auth is passed separately as a `Basic` token.

### Chromium proxy auth via `page.authenticate()`
Chromium's `--proxy-server` flag does NOT support `user:pass@host:port`. Auth must be handled via Puppeteer's `page.authenticate()` after page creation.

### Proxy for scraping only
Notifications (Telegram, Slack, etc.) use direct connections. Geocoding (Nominatim) is also excluded as it doesn't block datacenter IPs.

### Lazy import of undici
The implementation uses dynamic `import('undici')` to avoid loading undici when no proxy is configured.

## Settings Storage

Proxy URL stored as a global setting key-value pair (`proxyUrl`) in SQLite via the existing `settingsStorage` system. No schema changes needed — the POST route already forwards all fields to `upsertSettings()`.
