# CLAUDE.md

Guidance for Claude Code working in this repository. Keep this concise - you're the reader, not a human developer. Principles over tutorials.

## Project Overview

Fredy-CH is a Swiss fork of [Fredy](https://github.com/orangecoding/fredy), a self-hosted real estate finder. This fork replaces the German providers with Swiss platforms (ImmoScout24.ch, Homegate, Flatfox, etc.) while keeping the core pipeline and notification adapters.

Upstream sync: `git fetch upstream && git merge upstream/master`

## Mission

Finding an apartment in Switzerland is competitive and exhausting. You shouldn't have to manually refresh Homegate and ImmoScout every hour. Fredy-CH monitors Swiss platforms for you and notifies you instantly when new listings match your criteria.

## Target User

Someone searching for an apartment in Switzerland who wants to be first to respond to new listings—without constantly checking multiple websites.

## Common Commands

```bash
# Install dependencies
yarn

# Development (run both in separate terminals)
yarn run start:backend:dev    # Backend with hot reload (nodemon)
yarn run start:frontend:dev   # Frontend with Vite dev server

# Production
yarn run start:backend        # Starts backend on port 9998
yarn run start:frontend       # Builds and serves frontend

# Testing
yarn run test                 # Run all tests with Mocha
yarn run testGH               # Run tests excluding flaky provider tests (for CI)

# Linting and formatting
yarn run lint                 # ESLint
yarn run lint:fix             # ESLint with auto-fix
yarn run format               # Prettier formatting
yarn run format:check         # Check formatting without changes

# Database migrations
yarn run migratedb            # Run migrations
yarn run migratedb:overwrite  # Run migrations with checksum update
```

## Architecture

### Core Flow (FredyPipelineExecutioner)
The main processing pipeline in `lib/FredyPipelineExecutioner.js`:
1. Prepare provider URL (sorting by date)
2. Extract raw listings via Puppeteer or API
3. Normalize listings to common schema
4. Filter out incomplete/blacklisted entries
5. Identify new listings (vs. stored hashes in SQLite)
6. Persist new listings
7. Filter by similarity (cross-platform deduplication)
8. Dispatch notifications

### Directory Structure
```
lib/
├── provider/           # Real estate platform scrapers (immoscout, immowelt, etc.)
├── notification/
│   └── adapter/        # Notification channels (slack, telegram, discord, etc.)
├── services/
│   ├── extractor/      # HTML parsing with Puppeteer + Cheerio
│   ├── storage/        # SQLite database operations
│   ├── similarity-check/ # Cross-platform deduplication
│   ├── jobs/           # Job execution scheduling
│   └── crons/          # Background tasks
├── api/
│   └── routes/         # REST API endpoints
└── FredyPipelineExecutioner.js  # Core scraping pipeline
ui/src/                 # React frontend (Vite + DouyinFE Semi UI)
```

### Key Concepts
- **Provider**: A scraper for a real estate platform. Each exports `init()`, `metaInformation`, and `config` with crawl selectors.
- **Adapter**: A notification channel. Each exports `send()` and `config` with field definitions for the UI.
- **Job**: A combination of providers + adapters that runs on a configurable interval.

### Database
SQLite database stored at path configured in `conf/config.json` (default: `/db`). Migrations are in `lib/services/storage/migrations/`.

## Adding New Components

### New Provider
1. Create file in `lib/provider/<name>.js`
2. Export `init(sourceConfig, blacklist)`, `metaInformation` (name, baseUrl, id), and `config` (url, crawlContainer, crawlFields, normalize, filter)
3. Add tests in `test/provider/`

### New Notification Adapter
1. Create `lib/notification/adapter/<name>.js` with `send()` and `config` exports
2. Create `lib/notification/adapter/<name>.md` for documentation (rendered in UI)

## Testing & Development

### Playwright MCP for Provider Development

Use a **subagent** for Playwright exploration - it preserves main conversation context. The subagent explores the site and returns a concise summary of selectors/APIs found.

### Test Suite

Provider tests hit real websites and verify extraction works:

```bash
yarn run test                    # All tests
yarn run testGH                  # Exclude flaky provider tests (for CI)
```

Test structure:
- `test/provider/testProvider.json` - Test URLs for each provider
- `test/provider/<name>.test.js` - Integration tests per provider
- `test/utils.js` - Mock utilities (storage, notifications)

## Notes
- Node.js 22+ required
- Default login: admin/admin
- Frontend proxies `/api` to backend on port 9998 during development

## Swiss Providers (TODO)
- ImmoScout24.ch - Swiss real estate platform (different from German ImmoScout24.de)
- Homegate.ch - Largest Swiss platform
- Flatfox.ch - Modern Swiss platform
