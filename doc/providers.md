# 🌐 Providers & Scraping

A **provider** is a real-estate platform. When you create a job, you paste the search URL from the
platform into Fredy.

> [!IMPORTANT]
> Always make sure the search results are sorted by **date**, so Fredy picks up the newest listings
> first.

## The 24 built-in providers

**🇩🇪 Germany**

| | | |
|---|---|---|
| 1a Immobilien | Immo Südwest Presse | Neubau Kompass |
| Deutsche Wohnen | Immobilien.de | OhneMakler |
| Engel & Völkers | Immoscout | Regionalimmobilien24 |
| IMAXX | Immowelt | Schwarzes Brett Bremen |
| InBerlinWohnen | Kleinanzeigen | Sparkasse Immobilien |
| McMakler | Wg gesucht | |

**🇦🇹 Austria** · willhaben
**🇨🇭 Switzerland** · Flatfox
**🇪🇸 Spain · 🇮🇹 Italy · 🇵🇹 Portugal** · idealista
**🇮🇹 Italy** · Subito · Tecnocasa · Tecnorete · Casa.it

If you run a portal Fredy does not cover yet, contributions are very welcome, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Immoscout

Immoscout has implemented advanced bot detection. To work around this, Fredy uses a reverse
engineered version of their mobile API, see the
[Immoscout reverse engineering documentation](../reverse-engineered-immoscout.md).

Paste the search URL from your browser as usual. Beside flats and houses this covers plots, garages,
WG rooms, short term lets, assisted living and foreclosures, region, radius and drawn-shape
searches, and the "pretty" URLs the website generates when a search carries a single filter
(`haus-mit-garage-kaufen`, `3-zimmer-wohnung-mieten`, `wohnung-bis-800-euro-warm`, ...). Commercial
searches (offices, shops, gastronomy) are not supported.

Worth knowing:

- A filter that Immoscout's own API does not offer for the type you are searching (a pets filter on
  a house purchase, say) is **dropped** and logged, because sending it makes their API reject the
  whole search.
- A filter Fredy has no translation for yet is dropped as well, and says so in the log:
  `no translator for query parameter "..." ... please report the search URL`. Your search then runs
  **wider** than you set it, so if results look too broad, check the log first.
- If a search URL cannot be mapped at all, the job fails with `Real estate type not found: <path>`.
  Please open an issue with the URL, it is a one line fix.

## idealista

Uses the mobile APIs for idealista.com, idealista.it and idealista.pt, and the search URL determines
the country. `/multi/` URLs are supported, unrelated domains are rejected. Searches with filters or
categories the APIs do not offer fall back to Fredy's browser, which DataDome can block. See the
[provider documentation](../reverse-engineered-idealista.md) for supported endpoints and filters.

## Tecnocasa & Tecnorete

The two agency networks of the Tecnocasa group, listing different adverts. Both sites ignore the
requested sort order, so Fredy reads each search to the end, up to forty pages.

## Casa.it

Uses its mobile API and geography service to translate search URLs. Searches that cannot be
translated into API requests use the job's browser; the fallback reads up to twenty pages and stops
when a page provides no valid results. See the
[provider documentation](../reverse-engineered-casa.md) for supported endpoints and filters.

## Countries and the map

**Every provider declares the countries it covers**, and the job form puts the matching flag in
front of its name so a mixed list can be read at a glance. The declaration is one line on the
provider's `metaInformation`:

```javascript
export const metaInformation = {
  name: 'your provider name',
  baseUrl: 'https://www.yourprovider.fr/',
  id: 'yourprovider',
  countries: ['fr'],
};
```

Addresses are then geocoded in those countries, and the map opens on them so you can draw a search
area there. A provider spanning several is fine: `countries: ['de', 'at', 'ch']`.

## 🛡️ Bot detection & proxies

Most browser-based providers (kleinanzeigen, wg-gesucht, ohnemakler, ...) are scraped through a
hardened headless browser ([CloakBrowser](https://www.npmjs.com/package/cloakbrowser)). It makes the
**browser fingerprint** indistinguishable from a real Chrome, which is enough when you run Fredy on
a normal home connection.

On a **server / VPS the requests usually originate from a datacenter IP**, and providers behind
anti-bot systems (e.g. AWS CloudFront/WAF) block those based on **IP reputation alone**, no matter
how perfect the fingerprint is. The typical symptom: it works locally but you get
`We have been detected as a bot :-/` on the server.

### The fix: a residential proxy

A **residential proxy** routes Fredy's browser through the internet connection of a real household,
so the provider sees a "normal user" IP instead of a datacenter. For German portals, use a **German
(DE) residential** (or mobile/4G) proxy. Plain VPNs and **datacenter proxies do not help** here,
they share the same bad reputation as your server.

**Configure it** under **Administration → Execution → Proxy URL**. Supported formats:

```
http://user:pass@host:port
socks5://user:pass@host:port
```

Leave the field empty to disable. The proxy applies to all headless-browser providers and takes
effect on the next job run (no restart needed). Immoscout uses a separate mobile API and is not
affected.

### Where to get one

Residential proxies are a paid service (usually billed per GB, Fredy's traffic is small). Well-known
providers offering German residential IPs:

| Provider | Notes |
|---|---|
| [IPRoyal](https://iproyal.com) | Pay-as-you-go, no monthly minimum, good for low volume |
| [Webshare](https://www.webshare.io) | Cheap entry tier, has a small free plan to test with |
| [Decodo (formerly Smartproxy)](https://decodo.com) | Easy setup, country/city targeting |
| [SOAX](https://soax.com) | Residential + mobile, fine-grained geo-targeting |
| [Bright Data](https://brightdata.com) | Largest pool, most features, higher complexity/price |
| [Oxylabs](https://oxylabs.io) | Enterprise-grade, larger plans |

This is not an endorsement, pick whatever fits your budget. For low-volume use like Fredy, a
pay-as-you-go plan (e.g. IPRoyal) or a cheap entry tier (e.g. Webshare) is usually plenty. Select
**Germany** as the proxy location and keep the search interval reasonable, the higher the interval,
the less you look like a bot.
