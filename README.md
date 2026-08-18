<p align="center">

<a href="https://fredy.orange-coding.net/">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/orangecoding/fredy/blob/master/doc/logo_white.png" width="400">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/orangecoding/fredy/blob/master/doc/logo.png" width="400">
  <img alt="Jetbrains Open Source" src="https://github.com/orangecoding/fredy/blob/master/doc/logo.png">
</picture>
</a>
</p>

<p align="center">
  <a href="https://fredy.orange-coding.net/" target="_blank">Website</a>&nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="https://fredy-demo.orange-coding.net/" target="_blank">Demo</a>
</p>

<p align="center">
  <img src="https://github.com/orangecoding/fredy/actions/workflows/test.yml/badge.svg" alt="Tests" />
  <img src="https://github.com/orangecoding/fredy/actions/workflows/docker.yml/badge.svg" alt="Docker" />
  <img src="https://github.com/orangecoding/fredy/actions/workflows/check_source.yml/badge.svg" alt="Source" />
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Forangecoding%2Ffredy%2Ffredy&query=%24.downloadCount&label=Docker%20Pulls" alt="Docker Pulls" />
</p>



# Fredy 🏡 - Your Self-Hosted Real Estate Finder for Germany

**Fredy** scrapes **17 German real estate portals** (ImmoScout24, Immowelt, Kleinanzeigen,
WG-Gesucht, Immobilien.de, McMakler and more, see [Provider](#provider-)), drops duplicates
across platforms, and notifies you via **Slack, Telegram, Email, ntfy, Discord and more** as
soon as a new listing appears. Searches are managed from a Web UI, and you never see the same
listing twice.

On top of the listing itself, Fredy answers two questions:

- **What would this cost me?** Enter your income, living costs and savings once, and every
  listing is measured against them: comfortably affordable, a stretch, or out of reach, for
  renting and for buying. See [Financing Calculator](#-financing-calculator).
- **How long would I actually travel?** Not straight-line distance, but the real journey from
  your own address by public transport, car, bike or on foot. The map draws the transport
  network, marks every stop and shows the next departures. See [Travel Time](#travel-time) and
  [Public Transport](#public-transport).

------------------------------------------------------------------------

## 📖 Contents

[Key Features](#-key-features) · [Sponsorship](#-sponsorship) · [Demo](#-demo) ·
[Quick Start](#-quick-start) ·
[Core Concepts](#-core-concepts) · [Financing Calculator](#-financing-calculator) ·
[Travel Time](#travel-time) · [Public Transport](#public-transport) ·
[Immoscout](#immoscout) · [Bot Detection & Proxies](#-bot-detection--proxies) ·
[Analytics](#analytics) · [Debug Information](#-debug-information) ·
[Development](#-development) · [Architecture](#-architecture) ·
[Contributing](#-contributing) · [Credits & Data](#-credits--data) ·
[License](#-license) · [Support](#-support)

------------------------------------------------------------------------

## ✨ Key Features

-   🏠 Scrapes **17 German portals**: ImmoScout24, Immowelt, Kleinanzeigen, WG-Gesucht and
    [13 more](#provider-)
-   ⚡ Instant notifications: Slack, Telegram, Email (SMTP, SendGrid, Mailjet, Resend), ntfy,
    Discord, Mattermost, Pushover, Apprise and more
-   🔎 Uses the **ImmoScout Mobile API** (reverse engineered)
-   🖥️ **Web UI** to create and manage searches
-   🔄 Deduplication across platforms
-   ⏱️ Configurable search intervals and working hours
-   💶 **Financing calculator**: which listings you can afford, for renting and for buying
-   🚆 **Real travel times** from your addresses by public transport, car, bike or on foot,
    plus a filter to match
-   🗺️ **Public transport on the map**: the network, every stop, and live departures
-   🌍 Runs anywhere: Docker, Node.js, self-hosted

------------------------------------------------------------------------

## 🤝 Sponsorship

I build and maintain Fredy in my free time. If it saves you some, consider chipping in ❤️

<a href="https://ko-fi.com/orangecoding"><img alt="Support me on Ko-fi" src="https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-FF5E5B?style=for-the-badge&logo=kofi&logoColor=white"></a> <a href="https://github.com/sponsors/orangecoding"><img alt="Sponsor on GitHub" src="https://img.shields.io/badge/GitHub-Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white"></a>

**Backed by**

<a href="https://www.jetbrains.com/community/opensource/">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://www.jetbrains.com/company/brand/img/logo_jb_dos_3.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://resources.jetbrains.com/storage/products/company/brand/logos/jetbrains.svg">
  <img alt="JetBrains Open Source Support Program" src="https://resources.jetbrains.com/storage/products/company/brand/logos/jetbrains.svg" width="200">
</picture>
</a>

Fredy is supported by the **JetBrains Open Source Support Program**.

------------------------------------------------------------------------

## 👨‍🏫 Demo
You can try out Fredy here: [Fredy Demo](https://fredy-demo.orange-coding.net/)

------------------------------------------------------------------------

## 🚀 Quick Start

### With Docker

> [!NOTE]
> No configuration file is needed to start. Fredy creates `/conf/config.json` on first run if it is missing. That file only holds the database path, everything else is configured in the Web UI and stored in the database.

``` bash
docker run -d --name fredy \
  -v fredy_conf:/conf \
  -v fredy_db:/db \
  -p 9998:9998 \
  ghcr.io/orangecoding/fredy:master
```

`:master` follows the master branch. To pin a release instead, use its version tag, for example
`ghcr.io/orangecoding/fredy:26.5.1`. Images are built for `linux/amd64` and `linux/arm64`.

Logs:

``` bash
docker logs fredy -f
```

### Manual (Node.js)

-   Requirement: **Node.js 22.22.0 or higher** (see `engines` in `package.json`)
-   Install dependencies and start:

``` bash
yarn
yarn run build:frontend  # builds the Web UI into ui/public
yarn run start:backend   # serves the UI and the API on port 9998
```

👉 Open <http://localhost:9998>

### With Unraid

Should you use [Unraid](https://unraid.net/), you can now install Fredy from the community store :)

**Default Login:**
- Username: `admin`
- Password: `admin`

------------------------------------------------------------------------

## 📸 Screenshots

| Fredy Maps View                                  | Dashboard                                               | Found Listings                                                              |
|--------------------------------------------------|-----------------------------------------------------------------------|-----------------------------------------------------------------------------|
| ![Screenshot showing Fredy](doc/screenshot1.png) | ![Screenshot showing job configuration in Fredy](doc/screenshot3.png) | ![Screenshot showing found listings in Fredy](doc/screenshot2.png) |

------------------------------------------------------------------------

## 🧩 Core Concepts

Fredy is built around a handful of simple concepts:

### Provider 🌐

A **provider** is a real-estate platform. When you create a job, you paste the search URL from
the platform into Fredy.\
⚠️ Always make sure the search results are sorted by **date**, so Fredy picks up the newest
listings first.

Fredy ships with 17 providers:

| | | |
|---|---|---|
| 1a Immobilien | Immo Südwest Presse | Neubau Kompass |
| Deutsche Wohnen | Immobilien.de | OhneMakler |
| Engel & Völkers | Immoscout | Regionalimmobilien24 |
| IMAXX | Immowelt | Schwarzes Brett Bremen |
| InBerlinWohnen | Kleinanzeigen | Sparkasse Immobilien |
| McMakler | Wg gesucht | |

### Notification adapter 📡

An **adapter** is a *kind* of connection Fredy can send through (Slack,
Telegram, Email, ntfy, discord ...).\
Each adapter decides what it needs from you, for example an API key or a webhook URL.\
You never configure an adapter on its own. You configure a **channel**, which is one
filled-in adapter.

### Notification channel 🔔

A **channel** is one saved adapter configuration, for example "Telegram → family chat".\
You set it up once under **Settings → Notification channels** and reuse it in as many jobs
as you like. Rotating a token then means editing one channel instead of every job that used it.

A job can hold as many channels as you want, and every new listing goes out through all of
them at once. Several channels of the same type are fine, so "Telegram → family chat" and
"Telegram → work chat" can both be on the same search.

Every channel belongs to whoever created it. An administrator can share one with all users, or
with other administrators only. Sharing lets other people *send* through a channel, it never
reveals its credentials. Anyone who needs their own variant can duplicate the channel and fill
in their own.

A channel that is still used by a job cannot be deleted.

### Job 📅

A **job** combines providers and notification channels.\
Example: "Search apartments on ImmoScout24 + Immowelt and send results
to Slack + Telegram."\
Jobs run automatically at the interval you configure under **Administration → Execution**,
where you can also restrict them to working hours.

### MCP Server 🤖

Starting with **V20**, Fredy ships with a built-in **MCP Server**. This allows you to connect Fredy to LLMs (like Claude, ChatGPT, or local models via LM Studio) and query your real estate data using natural language.
The local LLM can even enrich existing listings by checking the listing online.   

For more information on how to set it up and use it, please refer to the [MCP Readme](lib/mcp/README.md).

------------------------------------------------------------------------

## 💶 Financing Calculator

The **Financing** page works out what a listing would cost you every month, and whether that
fits your household.

Every job declares whether it searches to **rent** or to **buy**, and the page has one tab for
each. Both share the same household block (income for one or two people, living costs, any loan
you are already paying off) and the same rule of thumb: housing costs plus existing debt at or
below 35 % of net income.

### Renting

Portals quote Kaltmiete, households pay warm. Set the Nebenkosten surcharge once, and Fredy
reports the highest cold rent you can take on, what that comes to warm, and what is left over
each month. The renting tab asks for nothing beyond that.

### Buying

The buying tab models the purchase the way a German bank would, as an **Annuitätendarlehen**:

- the **monthly rate**, and how it splits into interest and repayment over the years
- the **Kaufnebenkosten**: Grunderwerbsteuer for your Bundesland, Notar + Grundbuch, and the
  Maklerprovision. On a 400.000 € house in NRW these add roughly 46.000 € that you have to
  finance or pay out of your own pocket
- the **Restschuld** left when the Zinsbindung runs out, which you have to refinance at
  whatever rates exist then
- the **age at which you and your partner become debt-free**
- the **highest purchase price** that keeps you inside the 35 % rule

Loan scenarios can be compared side by side, each with a Sollzins, a Tilgung, a Zinsbindung, a
monthly rate and an optional Sondertilgung. Tilgung and monthly rate describe the same thing
from opposite ends, so editing one rewrites the other and you can enter whichever figure you
have. The term is calculated at a constant Sollzins. Fredy does not guess what a follow-up loan
will cost after the Zinsbindung, it reports the Restschuld instead.

### Where the result shows up

Each tab saves and deletes on its own. Once one is saved, its verdict appears elsewhere:

- an **affordability filter** on the listings overview, next to the status and provider
  filters, plus a small verdict chip on each listing
- a **rent card or a financing card** on the listing detail page, whichever matches the job
  that found the listing

Which calculation a listing gets follows the deal type of its job, so a 1.200 € rent is never
read as a very cheap house. Nothing appears until the matching tab is filled in.

An LLM can ask the same question over MCP with the `calculate_financing` tool, which returns a
mortgage answer or a rent answer depending on the listing.

> **This is an estimate, not financial advice.** The Grunderwerbsteuer rates ship as editable
> defaults and Bundesländer change them from time to time, so check the figure for your state
> and get a binding offer from your bank before committing to anything.

------------------------------------------------------------------------

## Travel Time

Two flats the same kilometre from your office can be eight minutes and fifty minutes away from
it. Fredy measures the journey instead of the distance.

Set your addresses under **Settings → Travel time**. Each gets a name and a mode: public
transport, car, or on foot. For public transport you also pick a time of day, since a journey at
eight in the morning is not the journey at midnight. The day is always the next working day, so
every listing is measured against the same timetable.

Travel times then show up wherever the distance already did: on listing cards and in the table, in
the map popup, in your notifications, and on the listing detail page.

### Filtering

Both the listings overview and the map have a **"reachable within"** filter. Pick a mode and a
ceiling, for example public transport within 30 minutes, and the list or the map drops everything
above it. Listings Fredy has not measured yet are hidden by the filter.

### Seeing the route

On a listing's detail page, **Show route** draws the journey on the map: the straight line, the
drive, the walk, or the public transport connection leg by leg in the operators' own line colours.
Hovering the public transport time opens the journey itself, one row per leg with the line, the stop
it goes to and how long that part takes.

### Estimated and exact

Fredy reports two kinds of number and always labels which one you are looking at.

**Estimated** comes from the background sweep. Once per address, Fredy asks how long it takes to
reach every stop in the region, then adds the walk from the closest stop to the front door. That is
one request per address no matter how many listings you have, which keeps the load on a
volunteer-run service low. Hover the *Estimated* chip to see the stops it used. Compared against
exact routing across Berlin, it lands within a few minutes.

**Exact** is fetched when you open a listing. Fredy requests the real journey, which also fills in
the car, bike and walking times and the drawable routes, and stores it so it is only requested once.

A mode that could not be routed is left out rather than shown as zero, and a listing that has not
been measured yet says so. The straight-line distance is still shown, so a failed lookup leaves you
no worse off than before.

### For operators

Defaults that normally need no change:

| Setting | Default | What it does |
|---|---|---|
| `motisBaseUrl` | `https://api.transitous.org/api` | Point at your own MOTIS instance if you outgrow the public one. |
| `travelTimeMaxMinutes` | `90` | How far the region-wide lookup reaches, and the main size dial. |
| `travelTimeStreetLookupsPerRun` | `15` | Ceiling on street routings per sweep. `0` turns them off. |
| `travelTimeLimitPerRun` | `500` | Listings one sweep works through. Not a request count. |
| `travelTimeMaxAgeDays` | `30` | When a stored travel time is looked up again. |

The sweep runs every two hours and never at startup. Street routing happens only where public
transport cannot answer at all, where you asked for car or walking, and when you open a listing.

------------------------------------------------------------------------

## Public Transport

"Gute Verkehrsanbindung" in a listing tells you nothing. Fredy shows the actual connection, on
the map and on every listing, without a detour to a timetable site.

### On the map

The map view has a **public transport layer**, switched on by default. It draws the rail,
S-Bahn, U-Bahn, tram and light rail network, colour-coded by mode, and marks every station and
bus stop with its own icon. It works on the standard map and on the satellite view.

Point at a stop and Fredy opens its **departure board**:

- which lines call there, as colored badges
- where each departure is headed
- when it leaves, how many minutes that is from now, and how late it is running

The layer can be turned off with the **ÖPNV** switch in the map panel. The setting lives in the
URL, so a link you bookmark or share keeps it.

### On every listing

The marker popup on the map and the listing detail page both show the **three nearest stops**
with their walking distance. Each opens the same departure board, so "how do I get to work from
here" is answered without leaving the listing.

------------------------------------------------------------------------

## Immoscout

Immoscout has implemented advanced bot detection. In order to work around this, we are using a reversed engineered version of their mobile api. See [Immoscout Reverse Engineering Documentation](https://github.com/orangecoding/fredy/blob/master/reverse-engineered-immoscout.md)

Paste the search URL from your browser as usual. Beside flats and houses this covers plots, garages, WG rooms, short term lets, assisted living and foreclosures, region, radius and drawn-shape searches, and the "pretty" URLs the website generates when a search carries a single filter (`haus-mit-garage-kaufen`, `3-zimmer-wohnung-mieten`, `wohnung-bis-800-euro-warm`, ...). Commercial searches (offices, shops, gastronomy) are not supported.

Worth knowing:

-   A filter that Immoscout's own API does not offer for the type you are searching (a pets filter on a house purchase, say) is **dropped** and logged, because sending it makes their API reject the whole search.
-   A filter Fredy has no translation for yet is dropped as well, and says so in the log: `no translator for query parameter "..." ... please report the search URL`. Your search then runs **wider** than you set it, so if results look too broad, check the log first.
-   If a search URL cannot be mapped at all, the job fails with `Real estate type not found: <path>`. Please open an issue with the URL, it is a one line fix.

## 🛡️ Bot Detection & Proxies

Most browser-based providers (kleinanzeigen, wg-gesucht, ohnemakler, ...) are scraped through a hardened headless browser ([CloakBrowser](https://www.npmjs.com/package/cloakbrowser)). It makes the **browser fingerprint** indistinguishable from a real Chrome, which is enough when you run Fredy on a normal home connection.

On a **server / VPS the requests usually originate from a datacenter IP**, and providers behind anti-bot systems (e.g. AWS CloudFront/WAF) block those based on **IP reputation alone**, no matter how perfect the fingerprint is. The typical symptom: it works locally but you get `We have been detected as a bot :-/` on the server.

### The fix: a residential proxy

A **residential proxy** routes Fredy's browser through the internet connection of a real household, so the provider sees a "normal user" IP instead of a datacenter. For German portals, use a **German (DE) residential** (or mobile/4G) proxy. Plain VPNs and **datacenter proxies do not help** here, they share the same bad reputation as your server.

**Configure it** under **Administration → Execution → Proxy URL**. Supported formats:

```
http://user:pass@host:port
socks5://user:pass@host:port
```

Leave the field empty to disable. The proxy applies to all headless-browser providers and takes effect on the next job run (no restart needed). Immoscout uses a separate mobile API and is not affected.

### Where to get a residential proxy

Residential proxies are a paid service (usually billed per GB, Fredy's traffic is small). Well-known providers offering German residential IPs include:

| Provider | Notes |
|---|---|
| [IPRoyal](https://iproyal.com) | Pay-as-you-go, no monthly minimum, good for low volume |
| [Webshare](https://www.webshare.io) | Cheap entry tier, has a small free plan to test with |
| [Decodo (formerly Smartproxy)](https://decodo.com) | Easy setup, country/city targeting |
| [SOAX](https://soax.com) | Residential + mobile, fine-grained geo-targeting |
| [Bright Data](https://brightdata.com) | Largest pool, most features, higher complexity/price |
| [Oxylabs](https://oxylabs.io) | Enterprise-grade, larger plans |

This is not an endorsement, pick whatever fits your budget. For low-volume use like Fredy, a pay-as-you-go plan (e.g. IPRoyal) or a cheap entry tier (e.g. Webshare) is usually plenty. Make sure to select **Germany** as the proxy location and keep the search interval reasonable (the higher the interval, the less you look like a bot).

## Analytics

Fredy is completely free (and will always remain free). However, it would be a huge help if you’d allow me to collect some analytical data.
Before you freak out, let me explain...  
If you agree, Fredy will send a ping once every 6 hours to my internal tracking project (Will be open sourced soon).  
The data includes: which notification adapters and providers are in use (the type only, for example `slack`, never your channels, their names or their credentials), OS, architecture, Node version, and language. The information is entirely anonymous and helps me understand which adapters/providers are most frequently used.

**Thanks**🤘

## 🐞 Debug Information

Since Fredy **22.5.0** there is a built-in way to capture everything Fredy logs into the
database for a limited time and download it as a single zip file. This is the recommended
way to attach diagnostics to a bug report. I decided against simply putting all logs into
a debug bundle due to privacy reasons!

**How it works**

- Debug logging is **opt-in** and admin-only. As long as it is off, Fredy behaves exactly
  as before (console output only, nothing in the DB).
- When you turn it on, every log line (`debug`, `info`, `warn`, `error`) is additionally
  written into the `debug_logs` SQLite table. The console keeps logging at its usual level.
- The recorded data is hard-capped at **5 MiB** via a rolling buffer: once the cap is hit,
  the oldest entries are dropped automatically so the newest ones always survive.
- The on/off flag is persisted, so debug logging stays on across restarts (and you'll see
  the warning banner everywhere until you turn it off again).

**Capturing a debug bundle**

1. Open Fredy as an **admin** and go to **Administration → Debug**.
2. Click **"Enable debug logging" / "Debug-Logging aktivieren"**. A red banner appears on
   every page while recording is on.
3. **Reproduce the bug**.
4. Come back to **Administration → Debug** and check the progress bar, if it stayed at 0 %,
   nothing was captured.
5. Click **"Download debug information" / "Debug Informationen herunterladen"**. You get a
   zip named `YYYY-MM-DD-FredyDebug-<version>.zip` containing two files:
   - `logs.txt` - every log line captured while recording was on, prefixed with timestamp
     and level.
   - `sys.txt` - runtime snapshot (Fredy version, Node.js version, OS, Docker detection,
     CPU, memory, sanitized settings). Proxy credentials and session secrets are
     **stripped** before export.
6. Attach the zip to the bug report.
7. Optional but recommended: click **"Disable debug logging"** to stop recording, and
   **"Delete stored debug logs"** once you've sent the zip so the DB does not keep them
   around.

**What is _not_ included**

- passwords/privacy relevant things
- Anything that Fredy itself does not pass through its `logger`. If a third-party library
  writes directly to `process.stderr`, that output stays on the console only.

## 🛠️ Development

### Development Mode

``` bash
yarn run start:backend:dev
yarn run start:frontend:dev
```
You should now be able to access _Fredy_ from your browser. Check your Terminal to see what port the frontend is running on.

### Run Tests

#### "Online" tests
These tests are directly executed against the actual providers.
``` bash
yarn run test
```

#### "Offline" tests
These tests are using the test fixtures instead of the actual providers. Much faster and "good enough" to test the core functionality.
``` bash
yarn run test:offline
```

#### Download new fixtures
If you have to refresh the fixtures (every once in a while needed because the providers change their code), run this command:
``` bash
yarn run test:download-fixtures
```

### Adding a new language

Fredy's UI is fully multilingual. Translation files live in `ui/src/locales/`. To add a new language, create a single JSON file there, no code changes required.

**Example: `ui/src/locales/fr.json`**
```json
{
  "_meta": {
    "flag": "🇫🇷",
    "name": "Français",
    "locale": "fr-FR",
    "semiLocale": "fr"
  },
  "nav.dashboard": "Tableau de bord",
  "common.save": "Enregistrer",
  ...
}
```

The `_meta` fields:

| Field | Description |
|---|---|
| `flag` | Unicode flag emoji shown in the language selector |
| `name` | Display name shown in the language selector |
| `locale` | BCP 47 locale string used for date and number formatting (e.g. `fr-FR`) |
| `semiLocale` | Semi UI locale key for component-level strings (date pickers, pagination, etc.) |

> **Important:** `semiLocale` must exactly match a locale filename from the Semi UI locale sources (without the `.js` extension). See the [available Semi UI locales on GitHub](https://github.com/DouyinFE/semi-design/tree/main/packages/semi-ui/locale/source) for the full list of supported keys.

After adding the file, rebuild the frontend (`yarn build:frontend` or restart the dev server) and the new language will appear automatically in **Settings → Preferences → Language**.

------------------------------------------------------------------------

## 📐 Architecture

``` mermaid
flowchart TD
 subgraph Jobs["Jobs"]
        A1["Job 1"]
        A2["Job 2"]
        A3["Job 3"]
  end
 subgraph Providers["Providers"]
        C1["Provider 1"]
        C2["Provider 2"]
        C3["Provider 3"]
  end
 subgraph NotificationChannels["Notification Channels"]
        F1["Channel 1"]
        F2["Channel 2"]
  end

    A1 --> B["FredyPipelineExecutioner"]
    A2 --> B
    A3 --> B
    B --> C1 & C2 & C3
    C1 --> D["Similarity Check"]
    C2 --> D
    C3 --> D
    D --> E{"Duplicate?"}
    E -- No --> F1 & F2
```

------------------------------------------------------------------------
## 🤖 Using AI such as Claude Code
When I started building Fredy, LLMs were still basically the wet dream of a few nerdy scientists.

Nowadays, it’s easier than ever to throw a prompt into the LLM of your choice and let 'the AI' build your stuff. I’m not against that. I use Claude Code myself for smaller tasks, and I do think these tools can be really useful.

That said, I still believe humans should stay in charge. AI is great-ish at writing code, but it still lacks creativity, context, and the ability to see the full picture.

So, if you want to contribute to Fredy, using AI tools to get things done is totally fine. Just please don’t stop thinking.

I’ve had one too many PRs full of hallucinated bullshit.

**Thanks ;)**

------------------------------------------------------------------------

## 👐 Contributing

Thanks to everyone who has contributed!

<a href="https://github.com/orangecoding/fredy/graphs/contributors"><img src="https://contrib.rocks/image?repo=orangecoding/fredy" /></a>

See the [Contributing
Guide](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTING.md).

------------------------------------------------------------------------

## 🗺️ Credits & Data

Timetables, journey planning and travel times come from
[Transitous](https://transitous.org/), a community-run [MOTIS](https://github.com/motis-project/motis)
instance. It is free, needs no API key, and is maintained by volunteers, so please be considerate
with the load you put on it and read [their usage policy](https://transitous.org/api/) before
pointing a large instance at it. Street and map data come from
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

<a href="https://transitous.org/">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://transitous.org/images/logo-text.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://transitous.org/images/logo-text-dark.svg">
  <img alt="Transitous" src="https://transitous.org/images/logo-text-dark.svg" width="180">
</picture>
</a>

------------------------------------------------------------------------

## 📄 License

[Apache-2.0](LICENSE) with two additional conditions:

- **Commons Clause** - you may not sell the software, or sell a product or service whose value
  derives entirely or substantially from it. Self-hosting Fredy for yourself is explicitly fine.
- **Attribution and Naming Clause** - substantial derivative works must credit the original
  project "Fredy" and its author.

Because of these conditions Fredy is **source-available, not OSI open source**. Read the full
[LICENSE](LICENSE) before building anything commercial on top of it.

------------------------------------------------------------------------

## 💬 Support

- **Bugs and feature requests**: [GitHub Issues](https://github.com/orangecoding/fredy/issues).
  For bugs, attach a debug bundle, see [Debug Information](#-debug-information).
- **An Immoscout search URL Fredy cannot map**: open an issue with the URL, it is usually a one
  line fix.

------------------------------------------------------------------------

## ⭐ Star History

<a href="https://github.com/orangecoding/fredy/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="doc/star-history/star-history-dark.svg">
    <img alt="Fredy star history" src="doc/star-history/star-history-light.svg">
  </picture>
</a>
