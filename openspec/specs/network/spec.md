# Network — Proxy Support

## Overview

Fredy supports routing scraping HTTP requests through a user-configured proxy. This is essential for users running Fredy on cloud/VPS servers where datacenter IPs are blocked by real estate platforms.

## Requirements

### REQ-NET-001: Central HTTP Client

The system SHALL provide a central HTTP client (`lib/services/http/httpClient.js`) that encapsulates all proxy/network concerns for scraping requests.

### REQ-NET-002: Proxy-Aware Fetch

The central HTTP client SHALL export a `scrapingFetch(url, options)` function that wraps native `fetch()` and adds an `undici.ProxyAgent` as `dispatcher` when a proxy is configured.

### REQ-NET-003: Proxy URL Resolution

The system SHALL resolve the proxy URL in the following priority order:
1. `proxyUrl` setting from the database (UI-configured)
2. `FREDY_PROXY_URL` environment variable
3. `HTTPS_PROXY` environment variable
4. `HTTP_PROXY` environment variable

### REQ-NET-004: Proxy Agent Caching

The system SHALL cache the `ProxyAgent` instance and reuse it across calls. The cache MUST be invalidated when global settings are updated.

### REQ-NET-005: Proxy Authentication

The system SHALL support proxy authentication via `user:password` in the proxy URL. For `undici.ProxyAgent`, credentials MUST be passed as a `Basic` auth token. For Puppeteer, credentials MUST be passed via `page.authenticate()` after page creation and before navigation.

### REQ-NET-006: Puppeteer Proxy Integration

The system SHALL strip authentication from the proxy URL before passing it to Chromium's `--proxy-server` launch argument. Credentials SHALL be stored on the browser object and applied via `page.authenticate()` on each new page.

### REQ-NET-007: Proxy Scope

The following requests SHALL be routed through the proxy when configured:
- All Puppeteer-based providers (Immowelt, Kleinanzeigen, WG-Gesucht, etc.)
- ImmoScout mobile API requests
- Listing active checks

The following requests SHALL NOT be routed through the proxy:
- Geocoding lookups (Nominatim)
- Notification adapters (Telegram, Slack, Discord, etc.)
- Analytics tracking
- Version checks

### REQ-NET-008: Settings UI

The system SHALL provide a "Network" tab in General Settings with a text input for the proxy URL. The help text MUST indicate that notifications and geocoding are not affected.

### REQ-NET-009: Proxy Configuration Format

The system SHALL support the following proxy URL formats:
- `http://host:port`
- `http://user:pass@host:port`
- `https://host:port`
- `https://user:pass@host:port`

## Scenarios

#### Scenario: No proxy configured
- GIVEN no proxy URL in settings or environment variables
- WHEN a scraping request is made via `scrapingFetch()`
- THEN the request is made directly via native `fetch()` without a dispatcher

#### Scenario: Proxy configured via settings
- GIVEN `proxyUrl` is set to `http://proxy:8080` in settings
- WHEN a scraping request is made via `scrapingFetch()`
- THEN an `undici.ProxyAgent` is created with `uri: 'http://proxy:8080'`
- AND the request is made with the agent as `dispatcher`

#### Scenario: Authenticated proxy
- GIVEN `proxyUrl` is set to `http://user:pass@proxy:8080`
- WHEN a Puppeteer browser is launched
- THEN `--proxy-server=http://proxy:8080` is added to launch args (no credentials)
- AND `page.authenticate({ username: 'user', password: 'pass' })` is called before navigation

#### Scenario: Environment variable fallback
- GIVEN no proxy URL in settings
- AND `FREDY_PROXY_URL=http://env-proxy:9090` is set
- WHEN a scraping request is made
- THEN the environment variable proxy is used

#### Scenario: Settings change clears cache
- GIVEN a proxy agent is cached from a previous request
- WHEN global settings are updated via `upsertSettings()`
- THEN `clearProxyCache()` is called
- AND the next request creates a fresh `ProxyAgent`

#### Scenario: Geocoding bypasses proxy
- GIVEN a proxy URL is configured
- WHEN a geocoding request is made via Nominatim
- THEN the request uses native `fetch()` directly (not `scrapingFetch`)
