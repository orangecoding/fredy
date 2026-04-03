# Proposal: Native Proxy Support

## Problem

Many real estate platforms block requests from datacenter IP ranges. Users running Fredy on VPS/cloud servers cannot scrape these platforms without a proxy. Fredy had partial Puppeteer proxy support (`--proxy-server` arg) but it was never wired to settings, and native `fetch()` calls had no proxy option at all.

## Intent

Add user-configurable proxy support so all scraping requests can be routed through a residential/datacenter proxy, while keeping notifications and geocoding on direct connections.

## Approach

Introduce a central HTTP client that encapsulates proxy logic. All scraping code routes through this client; proxy becomes an internal concern invisible to providers. New providers automatically get proxy support by using the client.

## Scope

- Global proxy URL setting in the UI (Network tab)
- Proxy support for all fetch-based and Puppeteer-based providers
- Proxy authentication via URL credentials
- Environment variable fallback for Docker deployments
- Geocoding excluded from proxying
