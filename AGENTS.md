# AGENTS.md

The guide for any coding agent working in this repository. `CLAUDE.md` points here; keep this file
as the single copy so the two cannot drift.

## Project Overview

Fredy is a self-hosted real estate finder for Germany. It scrapes German real estate portals (ImmoScout24, Immowelt, Immonet, Kleinanzeigen, WG-Gesucht, etc.), deduplicates results across providers, and sends notifications via Slack, Telegram, Email, Discord, ntfy, etc. It includes a React web UI and a built-in MCP server for LLM access to listings data.

- Node.js >= 22, ESM-only (`"type": "module"`)
- Default port: 9998, default login: admin / admin
- SQLite via `better-sqlite3` (synchronous - all DB ops are sync; only network I/O is async)

## Commands

```bash
# Development
yarn run start:backend:dev    # nodemon backend
yarn run start:frontend:dev   # Vite dev server (proxies /api → :9998)

# Production
yarn run start:backend        # NODE_ENV=production node index.js
yarn run build:frontend       # vite build → ui/public/

# Tests
yarn test                     # Live tests (hits actual providers)
yarn test:offline             # Offline tests using HTML/JSON fixtures (fast, preferred)
yarn test:download-fixtures   # Re-download fresh provider HTML fixtures

# Single test file
TEST_MODE=offline npx vitest run test/provider/immoscout.test.js

# Lint / Format (oxlint + oxfmt, from the oxc toolchain)
yarn lint && yarn lint:fix
yarn format && yarn format:check

# DB migrations
yarn migratedb
```

## Architecture

### Core data flow

```
index.js (startup)
  ├── runMigrations()
  ├── getProviders()            # lazily imports lib/provider/*.js
  ├── similarityCache.init()    # preloads hash cache from DB
  ├── api.js                    # starts fastify HTTP server
  └── initJobExecutionService() # registers event-bus listeners + starts scheduler

scheduler (every N minutes) or manual trigger via POST /api/jobs/:id/run
  └── FredyPipelineExecutioner.execute()
      1. queryStringMutator(url)           # inject sort-by-date param
      2. provider.getListings()            # API or Puppeteer+Cheerio
      3. provider.normalize(listing)       # raw → ParsedListing
      4. provider.filter(listing)          # blacklist + required fields
      5. filter to hashes not yet in DB
      6. provider.fetchDetails()           # optional enrichment
      7. geocodeAddress()                  # optional lat/lng
      8. storeListings()
      9. similarityCache.checkAndAddEntry() # cross-provider dedup (exact hash, then fingerprint)
      10. _filterBySpecs() + _filterByArea()
      11. notify.send()                    # fan-out to all adapters
```

### Plugin systems

**Providers** (`lib/provider/*.js`) - each module exports:
- `metaInformation` - `{ id, name, baseUrl }`, plus an optional `hosts` (every domain the portal
  serves the same application under, defaulting to `baseUrl`'s host; read by the job form's url
  check in `ui/src/services/jobs/providerUrl.js`) and an optional `countries` (ISO 3166-1 alpha-2,
  lowercase). Absent means `['de']`, which is why no shipped provider declares it and why adding the
  field changed no existing installation. Resolved in `lib/services/providers/`: `countries.js` is
  the pure half (the default, normalisation, union) and is all the Nominatim client imports, since
  `providerCountries.js` reaches for the job storage and would drag SQLite in behind it. The
  geocoder searches within the resolved countries; the map's `maxBounds` is the union of their
  boxes from `ui/src/components/map/countryBounds.js`. Where no provider exists to ask - home
  addresses, the listings map, the listing detail - the answer is the union across the jobs the user
  can see, and where the job form is open it is the providers ticked in it
- `config` - the **static** `ProviderConfig` template: `requiredFieldNames`, `crawlContainer`, `crawlFields`, `sortByDateParam`, `normalize()`, optional `getListings()`, `fetchDetails()`, `activeTester()`. `url` is `null` here and there is no bound `filter`.
- `createConfig(sourceConfig, blacklist)` - returns a **fresh** `ProviderConfig` per job run: the template plus this run's `url`, `enabled`, and a `filter` closed over this run's blacklist.

Providers are **stateless**. Nothing run-specific may live at module scope: two jobs can execute
concurrently (a manual run started while the scheduler is working), and shared mutable state let
the second job overwrite the first one's URL and blacklist mid-run, storing listings under the
wrong job. The same rule is why the Cheerio parser builds its document inside `parse()` instead of
keeping a module-level `$`.

**Notification adapters** (`lib/notification/adapter/*.js`) - each exports:
- `config` - `{ id, name, description, fields }` (drives the UI form)
- `send({ serviceName, newListings, notificationConfig, jobKey, baseUrl })`
- Loaded dynamically at startup via `fs.readdirSync`

Field definitions carry two optional flags that the UI and the API read declaratively, so neither
needs per-adapter code:
- `secret: true` - a credential. Never serialised to anyone who may not edit the channel, and
  masked in the form. Every token, password, API key and webhook URL must carry it.
- `target: true` - the one field naming the destination. Drives the "Destination" column.

An adapter *configuration* is separate from the adapter itself: it is a row in `configured_adapter`
("a notification channel" in the UI) that many jobs can reference.

### Key services

| Service | Location | Notes |
|---|---|---|
| Event bus | `lib/services/events/event-bus.js` | Plain `EventEmitter`; events: `jobs:runAll`, `jobs:runOne`, `jobs:status` |
| SSE broker | `lib/services/sse/sse-broker.js` | Per-userId `Set<ServerResponse>`; heartbeat every 25s; pushes job status to UI |
| Similarity cache | `lib/services/similarity-check/` | Per-job dedup, refreshed hourly. Two tiers: an exact SHA-256 over `jobId\|title\|price\|address`, then `listingFingerprint.js`, which matches the same flat across *different* providers on living space, rooms and location. Portals never agree on the headline, the address format, or what "price" means, so the hash tier alone never fired across providers |
| Notification channels | `lib/services/storage/configuredAdapterStorage.js` | Saved adapter configurations (`configured_adapter`). Jobs store `[{configuredAdapterId}]`; `jobStorage` hydrates those back into `{id, name, fields}` on every read, so the pipeline never sees the indirection. Who may use vs. edit a channel: `lib/services/security/channelAccess.js` |
| SqliteConnection | `lib/services/storage/SqliteConnection.js` | Singleton, WAL mode; `execute()`, `query()`, `withTransaction()` |
| Migrations | `lib/services/storage/migrations/` | Numbered JS files each exporting `up(db)`; checksum-tracked in `schema_migrations` |
| Extractor | `lib/services/extractor/` | Orchestrates Puppeteer + Cheerio; shared browser instance per job |
| Listing documents | `lib/services/storage/listingAttachmentsStorage.js` | Uploaded exposés (`listing_attachments`), bytes and all. Type and filename guards in `lib/services/listings/attachmentTypes.js`; routes in `lib/api/routes/listingAttachmentsRouter.js` |

### Uploaded documents live in the database

The exposé a user attaches to a listing is a BLOB in `listing_attachments`, not a file next to
`listings.db`. Fredy usually runs in a container whose filesystem is discarded, and the only thing
users are told to persist is the `/db` volume, so the database is the one place uploaded bytes are
already safe. Three things follow from that for free, and all three would otherwise be code:

- Backups already carry them, because `backupRestoreService` copies the whole database.
- `foreign_keys = ON` plus `ON DELETE CASCADE` disposes of them exactly when the listing goes -
  retention purge, deleted job, manual hard delete, all of them, none of which know this table
  exists. Files would need an unlink in each of those paths plus a sweeper for the ones missed.
- There is no filename that can escape anywhere, because no filename ever reaches a filesystem.

The one thing that is *not* free is the size, hence the two admin settings
(`listingAttachmentMaxMb`, `listingAttachmentMaxPerListing`) and the rule that nothing reading
attachment metadata may `SELECT *`.

Uploading also exempts a listing from `purgeExpiredInactiveListings`, alongside the watch list.
Preserving a record of an ad that has been taken down is the point of the feature, so deleting it on
a timer would delete exactly what the upload was for.

The type stored on a row comes from the file's magic bytes, never from the `Content-Type` the
browser sent, because these files are served back from Fredy's own origin: a renamed `.html`
getting through would be stored cross-site scripting. Responses carry `nosniff`, and only images
go out `inline`.

### Frontend

- React 19 SPA, Vite build → `ui/public/` (served as static by backend)
- State: Zustand single store with per-domain slices
- UI library: `@douyinfe/semi-ui`
- Map: MapLibre GL + `@mapbox/mapbox-gl-draw` + `@turf/boolean-point-in-polygon` for GeoJSON polygon filters
- In dev: Vite proxies `/api` to `:9998`

### Theming (light and dark)

The interface ships two themes. Which one an account gets is a user setting like language, stored
in the `settings` table under `theme` and served from `/api/user/settings`.

The whole switch is one attribute on `<body>`:

```
<body theme-mode="dark">   <body theme-mode="light">
```

Semi UI already keys its own component styles off `body[theme-mode=dark]`, and Fredy hangs its
palette off the same attribute, so setting it repaints both at once and nothing has to re-render
for the CSS to follow.

**The two palettes live in `ui/src/themes.less`, and nowhere else.** That file has exactly two
blocks - `:root` for dark, `body[theme-mode='light']` for light - and it is the only stylesheet in
the app allowed to contain a colour literal. Both blocks are complete rather than one plus a set of
overrides: a token added to one and forgotten in the other inherits whatever the first theme left
behind, and nothing looks wrong until someone switches. `test/ui/theme.test.js` fails the build on
both mistakes - a token missing from a block, and a colour literal appearing in any other
stylesheet.

`ui/src/tokens.less` is the layer everything else styles against. Every `@color-*` there is a thin
alias onto a custom property (`@color-surface: var(--f-surface)`), which is what makes a theme
switchable at all - a Less variable holding a hex is resolved at build time and can never be
anything else at runtime. Two consequences when adding to it:

- Less colour functions (`fade`, `darken`, `lighten`) cannot operate on a custom property. A colour
  that needs an alpha variant needs its channels published as well; those are the `-rgb` aliases,
  used as `rgb(@color-accent-rgb / 20%)`.
- `tokens.less` must stay free of rules. Roughly forty stylesheets import it, and anything that
  emits CSS from there is emitted forty times. `themes.less` is imported once, from `Index.less`.

**Where the choice comes from.** The `settings` table, and nowhere else. `theme.js` caches nothing
- no localStorage, no cookie - and `test/ui/theme.test.js` fails if one is reintroduced. A user
setting has one home, and a second copy is a second answer waiting to disagree with it.

1. `index.html` ships `<body theme-mode="dark">`, which is `DEFAULT_THEME`. That covers the login
   screen and the moment a cold load spends fetching settings; the app renders nothing until they
   land, so all that is on screen is a background in the default.
2. `App.jsx` reads `userSettings.settings.theme` straight off the store and applies it. Before the
   settings arrive that selector is undefined, which normalises to the default already painted, so
   nothing repaints.
3. `PreferencesPage` writes through `actions.userSettings.setTheme`, which POSTs to
   `/api/user/settings/theme` and updates the store; the repaint happens through step 2, so a theme
   picked in the form and one arriving on login take the same path.

**Things CSS cannot switch, and how they are handled.** Two kinds:

- *Canvas.* Charts are painted onto a canvas and keep whatever they were last painted with, so
  `chartTheme.js` reads its colours from the custom properties through getters, and `<Layout>` in
  `App.jsx` is keyed on the theme so everything below it remounts on a switch. Never reintroduce a
  hardcoded hex there - the file used to carry a hand-maintained copy of the palette and it is gone.
- *Assets.* The wordmark has a light and a dark cut, and no custom property can swap a PNG. Those
  call sites read `currentTheme()` directly. Everything expressible as a colour should use the
  tokens and let CSS do the work.

**Colours that are legitimately literal**: scrims and hairlines drawn over listing photography,
which stays photography in both themes; `#000` used as a mask stencil; white on the accent, which
is dark red either way; and MapLibre paint and marker colours (`ui/src/components/map/overlayLayers.js`,
`darkBasemapPaint.js`, `markerColors.js`), because a map layer or marker takes a colour string and
cannot read a custom property. Anything drawn in HTML around the map (legend, badges) still uses
the tokens.

**The map follows the theme.** The vector basemap is OpenFreeMap's `bright` style in the light theme
and its `dark` style in the dark theme; satellite imagery is the same in both (`isDarkBasemap` in
`ui/src/components/map/Map.jsx`). The overlays carry one paint set per basemap (`OVERLAY_PAINT.light`
and `.dark`), and the canvas is dimmed on a bright basemap and lifted on the dark one.

**Tracking.** Switching theme fires `CHANGE_THEME_DARK` or `CHANGE_THEME_LIGHT`. A tracking event
carries a feature name and nothing else (`trackPoi` sends one string), so any value worth reporting
has to be part of the name - which is why there is a POI per theme rather than one for the setting.
It fires on the transition only: re-saving the theme you are already on, including the first-ever
save of `dark` by an account that was on the dark default, is not somebody changing theme.

Contrast is not a matter of taste here: the light accent is two steps darker than the dark one
(`#b04a3f` against `#c0564a`) because the dark red that carries white text at 4.5:1 on near-black
falls below AA against paper, and every primary button in the app depends on it.

### MCP server

Two transports:
1. **stdio** (`lib/mcp/stdio.js`) - for Claude Desktop/LM Studio; opens its own DB connection (main process need not be running)
2. **HTTP** (`/api/mcp`) - authenticated via Bearer token (`mcp_token` column in `users` table)

Read tools: `list_jobs`, `get_job`, `list_listings`, `get_listing`, `get_photo_for_listing`, `calculate_financing`, `get_current_date_time`.
Write tools: `add_listing_note`, `set_listing_notes`, `watch_listing`, `unwatch_listing`, and the four that create a job.
Responses are Markdown via `lib/mcp/mcpNormalizer.js`.

Job creation is a draft-based interview, not a single call: `lib/mcp/jobDraftStore.js` holds the state (in memory, per user, 30 min) and computes the next question; `lib/mcp/jobDraftContext.js` is the only part that reads the database and is what strips channel secrets. Write tools go through `authenticateWriteToolCall`, which also enforces the `mcp:write` OAuth scope and refuses non-admins while demo mode is on.

## Key Conventions

- **ESM only** - `import`/`export` everywhere, no CommonJS
- **JSDoc typedefs** (no TypeScript) in `lib/types/` - `listing.js`, `job.js`, `filter.js`, `providerConfig.js`
- **Lint / format** - oxlint (`.oxlintrc.json`) and oxfmt (`.oxfmtrc.json`), both from the oxc toolchain. There is no ESLint and no Prettier; `eslint-disable` comments still work because oxlint reads them
- **Copyright header** required on all `.js` files - enforced by `lint-staged` pre-commit hook via `copyright.js`
- **`NoNewListingsWarning`** (`lib/errors.js`) is used as control flow to short-circuit the pipeline (not an error)
- **Test fixtures** in `test/testFixtures/` - HTML/JSON snapshots per provider; `TEST_MODE=offline` mocks `puppeteerExtractor` and global `fetch` via `test/offlineFixtures.js`
- **`conf/config.json`** is the only runtime config file; created with defaults if missing

## Coding
- After building the task, run the linter
- After building the task, run the tests
- New features must be tested
- New features must be properly documented with JsDoc
- You do **not** commit any changes, you do **not** create a new branch unless I told you so
