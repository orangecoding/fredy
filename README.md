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

Finding an apartment or house in Germany can be stressful and
time-consuming.\
**Fredy** makes it easier: it automatically scrapes **ImmoScout24,
Immowelt, Immonet, eBay Kleinanzeigen, WG-Gesucht, and InBerlinWohnen** and notifies you
instantly via **Slack, Telegram, Email, ntfy, discord and more** when new
listings appear.

With a modern architecture, Fredy provides a **clean Web UI**, removes
duplicates across platforms, and stores results so you never see the
same listing twice.

Fredy also knows what a place would cost **you**. Enter your financial situation once, your
income, your living costs, what you have saved, and every listing is measured against it. Fredy
tells you which ones you can comfortably afford, which would be a stretch, and which are out of
reach, for renting and for buying alike. See [Financing Calculator](#-financing-calculator).

And it shows you how well connected a place is. Not as a crow-flying kilometre, which in a city
with a river and no bridge where you want one tells you nothing, but as the **time it actually
takes** to get from your own front door to the flat, by public transport, car, bike or on foot.
The map draws the **public transport network**, marks every stop, and tells you which lines run
there and when the next one leaves. See [Travel Time](#travel-time) and
[Public Transport](#public-transport).

------------------------------------------------------------------------

## ✨ Key Features

-   🏠 Scrapes **ImmoScout24, Immowelt, Immonet, eBay Kleinanzeigen,
    WG-Gesucht, InBerlinWohnen**
-   ⚡ Instant notifications: Slack, Telegram, Email (SendGrid,
    Mailjet), ntfy, discord 
-   🔎 Uses the **ImmoScout Mobile API** (reverse engineered)
-   🌍 Runs anywhere: Docker, Node.js, self-hosted
-   🖥️ Intuitive **Web UI** to manage searches
-   🎯 Easy to use thanks to a user-friendly Web UI
-   🔄 Deduplication across platforms
-   ⏱️ Customizable search intervals
-   💶 Add your **personal financial situation** and see which listings you can actually
    afford, for renting and for buying
-   ⏱️ Shows the **real travel time** from your addresses to every listing, by public
    transport, car, bike or on foot, and filters listings by it
-   Makes **public transport visible**: the network on the map, live departures per stop,
    and the nearest stops for every listing

------------------------------------------------------------------------

## 🤝 Sponsorship [![](https://img.shields.io/static/v1?label=Sponsor&message=❤&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/orangecoding)

I maintain Fredy and other open-source projects in my free time, if you find it useful, consider supporting the project ❤️

#### Support me on 
[Ko-Fi](https://ko-fi.com/orangecoding) |  [Github](https://github.com/sponsors/orangecoding)
----

Fredy is proudly backed by the **JetBrains Open Source Support Program**.   

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://www.jetbrains.com/company/brand/img/logo_jb_dos_3.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://resources.jetbrains.com/storage/products/company/brand/logos/jetbrains.svg">
  <img alt="Jetbrains Open Source" src="https://resources.jetbrains.com/storage/products/company/brand/logos/jetbrains.svg">
</picture>

--------

Timetables, journey planning and travel times are provided by
[Transitous](https://transitous.org/), a community-run [MOTIS](https://github.com/motis-project/motis)
instance. It is free, needs no API key, and is maintained by volunteers. Street and map data come
from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Please be considerate
with the load you put on it, and see [their usage policy](https://transitous.org/api/) before
pointing a large instance at it.

<picture>
  <img alt="https://transitous.org/" src="https://transitous.org/images/logo-text.svg">
</picture>

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

Logs:

``` bash
docker logs fredy -f
```

### Manual (Node.js)

-   Requirement: **Node.js 22 or higher**
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

A **provider** is a real-estate platform (e.g. ImmoScout24, Immowelt,
Immonet, Deutsche Wohnen, eBay Kleinanzeigen, WG-Gesucht).\
When you create a job, you paste the search URL from the platform into
Fredy.\
⚠️ Always make sure the search results are sorted by **date**, so Fredy
picks up the newest listings first.

### Notification adapter 📡

An **adapter** is a *kind* of connection Fredy can send through (Slack,
Telegram, Email, ntfy, discord ...).\
Each adapter decides what it needs from you, for example an API key or a webhook URL.\
You never configure an adapter on its own. You configure a **channel**, which is one
filled-in adapter.

### Notification channel 🔔

A **channel** is one saved adapter configuration, "Telegram → family chat", say.\
You set it up once under **Settings → Notification channels** and reuse it in as many jobs
as you like. Rotating a token means editing one channel instead of every job that used it.

A job can hold as many channels as you want, and every new listing goes out through all of
them at once. Several channels of the same type are fine, so "Telegram → family chat" and
"Telegram → work chat" can both be on the same search.

Every channel belongs to whoever created it. An administrator can additionally share one with
all users, or with other administrators only. Sharing lets other people *send* through a
channel, it never shows them its credentials. Anyone who wants their own variant can
duplicate the channel and fill in their own.

Deleting a channel is blocked while a job still uses it, so a search can never quietly stop
notifying you.

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

Finding a place you like is one thing. Working out whether you can actually pay for it is
another. The **Financing** page answers the question the listing page cannot: what would this
cost me every month, and does it fit?

Every job now says whether it searches for something to **rent** or something to **buy**, and
the finance page has one tab for each. Both sit on the same household block - income for one or
two people, living costs, any loan you are already paying off - and both are judged by the same
rule of thumb: housing costs plus existing debt at or below 35 % of net income.

### Renting

Portals quote the Kaltmiete, but a household pays warm. Set the Nebenkosten surcharge once and
Fredy reports the highest cold rent you can take on, what that comes to warm, and what is left
over each month. Nothing else is asked for: someone who only ever rents is never made to answer
a question about Grunderwerbsteuer.

### Buying

The buying tab models the purchase the way a German bank would, as an **Annuitätendarlehen**:

- the **monthly rate**, and how it splits into interest and repayment over the years
- the **Kaufnebenkosten**: Grunderwerbsteuer for your Bundesland, Notar + Grundbuch, and the
  Maklerprovision. On a 400.000 € house in NRW these add roughly 46.000 € that has to be
  financed or covered from your own pocket
- the **Restschuld** left when the Zinsbindung runs out, which is the amount you have to
  refinance at whatever rates exist then
- the **age at which you and your partner become debt-free**
- the **highest purchase price** that keeps you inside the 35 % rule

Several loan scenarios can be compared side by side. Each carries a Sollzins, a Tilgung, a
Zinsbindung, a monthly rate and an optional Sondertilgung. Tilgung and monthly rate are the same
number seen from opposite ends, so editing either one rewrites the other and you can work from
whichever figure you actually have. The term is calculated at a constant Sollzins; what a
follow-up loan costs after the Zinsbindung is anyone's guess, so the Restschuld is reported
instead of a made-up rate.

### It follows you around the app

Each half saves and deletes on its own, and once a half is saved it shows up elsewhere:

- an **affordability filter** on the listings overview, next to the status and provider
  filters, plus a small verdict chip on each listing
- a **rent card or a financing card** on the listing detail page, whichever matches the job
  that found the listing

Which yardstick a listing gets follows the deal type of its job, so a 1.200 € rent is never
mistaken for an absurdly cheap house. Everything stays hidden until the matching half exists,
so nothing changes for anyone who does not use this.

An LLM can ask the same question over MCP with the `calculate_financing` tool, which returns a
mortgage answer or a rent answer depending on the listing.

> **This is an estimate, not financial advice.** The Grunderwerbsteuer rates ship as editable
> defaults and Bundesländer change them from time to time, so check the figure for your state
> and get a binding offer from your bank before committing to anything.

------------------------------------------------------------------------

## Travel Time

Straight-line distance is a bad proxy for whether you could live somewhere. Two flats the same
kilometre from your office can be eight minutes and fifty minutes away from it. Fredy measures the
journey instead.

Set your addresses under **Settings → Travel time**. Each one gets a name, and how you travel to it:
public transport, by car, or on foot. For public transport you also pick a time of day, because a
journey at eight in the morning is not the journey at midnight. The day is always the next working
day, so every listing is measured against the same timetable and stays comparable.

Travel times then show up wherever the distance already did: on listing cards and in the table, in
the map popup, in your notifications, and on the listing detail page.

### Filtering by it

Both the listings overview and the map have a **"reachable within"** filter. Pick a mode and a
ceiling, say public transport within 30 minutes, and the list filters or the map hides the pins that
fail it. Listings Fredy has not measured yet are not shown by the filter, because it can only speak
about journeys it knows.

### Seeing the route

On a listing's detail page, **Show route** draws the journey on the map: the straight line, the
drive, the walk, or the public transport connection leg by leg in the operators' own line colours.
Hovering the public transport time opens the journey itself, one row per leg with the line, the stop
it goes to and how long that part takes.

### Estimated and exact

Two kinds of number, and Fredy always says which.

**Estimated** is what the background sweep produces. Once per address, Fredy asks how long it takes
to reach every stop in the region, then adds the walk from the closest one to the front door. That is
one request per address no matter how many listings you have, which is what keeps this affordable on
a service run by volunteers. Hover the *Estimated* chip and Fredy shows the stops it used, so you can
check the number rather than take it on faith. Measured against exact routing across Berlin, it
lands within a few minutes.

**Exact** is what you get when you open a listing. Fredy asks for the real journey, which also fills
in the car, bike and walking times and the drawable routes, and stores it so it is only paid for
once.

Nothing is invented. A mode that could not be routed is left out rather than shown as zero, and a
listing that has not been measured yet says so. The straight-line distance is still there and still
shown, so if a lookup fails you see exactly what you saw before.

### For operators

Sensible defaults, none of which need touching:

| Setting | Default | What it does |
|---|---|---|
| `motisBaseUrl` | `https://api.transitous.org/api` | Point at your own MOTIS instance if you outgrow the public one. |
| `travelTimeMaxMinutes` | `90` | How far the region-wide lookup reaches. Also the size dial. |
| `travelTimeStreetLookupsPerRun` | `15` | Ceiling on street routings per sweep. `0` turns them off. |
| `travelTimeLimitPerRun` | `500` | Listings one sweep works through. Not a request count. |
| `travelTimeMaxAgeDays` | `30` | When a stored travel time is looked up again. |

The sweep runs every two hours and never at startup. Street routing happens only where public
transport cannot answer at all, where you asked for car or walking, and when you open a listing.

------------------------------------------------------------------------

## Public Transport

A listing that says "gute Verkehrsanbindung" tells you nothing. Fredy shows you the actual
connection, on the map and on every listing, without leaving the app for a timetable.

### On the map

The map view has a **public transport layer**, switched on by default. It draws the rail,
S-Bahn, U-Bahn, tram and light rail network, colour-coded by mode, and marks every station and
bus stop with its own icon. It works on the standard map as well as on the satellite view, where
the imagery itself shows nothing of the sort.

Point at a stop and Fredy opens its **departure board**:

- which lines call there, as colored badges
- where each departure is headed
- when it leaves, how many minutes that is from now, and how late it is running

The layer can be turned off with the **ÖPNV** switch in the map panel. The setting lives in the
URL, so a link you bookmark or share keeps it.

### On every listing

The marker popup on the map and the listing detail page both show the **three nearest stops**
with their walking distance. Each one opens into the same departure board, so the question
"how do I get to work from here" is answered on the listing itself.

------------------------------------------------------------------------

## Immoscout

Immoscout has implemented advanced bot detection. In order to work around this, we are using a reversed engineered version of their mobile api. See [Immoscout Reverse Engineering Documentation](https://github.com/orangecoding/fredy/blob/master/reverse-engineered-immoscout.md)

## 🛡️ Bot Detection & Proxies

Most browser-based providers (immowelt, immonet, kleinanzeigen, ...) are scraped through a hardened headless browser ([CloakBrowser](https://www.npmjs.com/package/cloakbrowser)). It makes the **browser fingerprint** indistinguishable from a real Chrome, which is enough when you run Fredy on a normal home connection.

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
The data includes: which notification adapters and providers are in use (the type only, for example `slack`, never your channels, their names or their credentials), OS, architecture, Node version, and language. The information is entirely anonymous and helps me understand which adapters/providers are most frequently used.</p>

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

## "Online" tests
These tests are directly executed against the actual providers.
``` bash
yarn run test
```

## "Offline" tests
These tests are using the test fixtures instead of the actual providers. Much faster and "good enough" to test the core functionality.
``` bash
yarn run test:offline
```

## Download new fixtures
If you have to refresh the fixtures (every once in a while needed because the providers change their code), run this command:
``` bash
yarn run test:download-fixtures
```

## Adding a new language

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

## ⭐ Star History

[![Star History
Chart](https://api.star-history.com/svg?repos=orangecoding/fredy&type=Date)](https://www.star-history.com/#orangecoding/fredy&Date)
