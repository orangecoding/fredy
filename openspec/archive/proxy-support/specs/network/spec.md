# Delta Spec: Network — Proxy Support

## ADDED Requirements

### REQ-NET-001: Central HTTP Client
The system SHALL provide a central HTTP client (`lib/services/http/httpClient.js`) that encapsulates all proxy/network concerns for scraping requests.

### REQ-NET-002: Proxy-Aware Fetch
The central HTTP client SHALL export a `scrapingFetch(url, options)` function that wraps native `fetch()` and adds an `undici.ProxyAgent` as `dispatcher` when a proxy is configured.

### REQ-NET-003: Proxy URL Resolution
The system SHALL resolve the proxy URL in priority order: settings > `FREDY_PROXY_URL` > `HTTPS_PROXY` > `HTTP_PROXY`.

### REQ-NET-004: Proxy Agent Caching
The system SHALL cache the `ProxyAgent` instance and reuse it across calls. The cache MUST be invalidated when global settings are updated.

### REQ-NET-005: Proxy Authentication
The system SHALL support proxy authentication via `user:password` in the proxy URL.

### REQ-NET-006: Puppeteer Proxy Integration
The system SHALL strip authentication from the proxy URL before passing it to `--proxy-server`. Credentials SHALL be applied via `page.authenticate()`.

### REQ-NET-007: Proxy Scope
All provider requests and listing active checks SHALL be proxied. Geocoding, notifications, analytics, and version checks SHALL NOT be proxied.

### REQ-NET-008: Settings UI
The system SHALL provide a "Network" tab in General Settings with a proxy URL text input.

### REQ-NET-009: Proxy Configuration Format
The system SHALL support `http(s)://[user:pass@]host[:port]` proxy URL formats.

## ADDED Scenarios

#### Scenario: No proxy configured
- GIVEN no proxy URL in settings or environment
- WHEN `scrapingFetch()` is called
- THEN native `fetch()` is used without dispatcher

#### Scenario: Authenticated proxy with Puppeteer
- GIVEN proxy URL `http://user:pass@proxy:8080`
- WHEN a browser is launched
- THEN `--proxy-server=http://proxy:8080` is set (no credentials in arg)
- AND `page.authenticate()` is called with decoded credentials

#### Scenario: Settings change clears cache
- GIVEN a cached ProxyAgent exists
- WHEN `upsertSettings()` is called for global settings
- THEN `clearProxyCache()` is invoked
