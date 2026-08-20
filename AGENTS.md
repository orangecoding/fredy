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

# Lint / Format
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
- `metaInformation` - `{ id, name, baseUrl }`
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
is dark red either way. The map basemap is the light OpenFreeMap style in both themes, so map
overlays follow the page rather than inverting.

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

Tools: `list_jobs`, `get_job`, `list_listings`, `get_listing`, `get_current_date_time`. Responses are Markdown via `lib/mcp/mcpNormalizer.js`.

## Key Conventions

- **ESM only** - `import`/`export` everywhere, no CommonJS
- **JSDoc typedefs** (no TypeScript) in `lib/types/` - `listing.js`, `job.js`, `filter.js`, `providerConfig.js`
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

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
