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
npm install

# Development (run both in separate terminals)
npm run start:backend:dev    # Backend with hot reload (nodemon)
npm run start:frontend:dev   # Frontend with Vite dev server

# Production
npm run start:backend        # Starts backend on port 9998
npm run start:frontend       # Builds and serves frontend

# Testing
npm run test                 # Run all tests with Mocha
npm run testGH               # Run tests excluding flaky provider tests (for CI)

# Linting and formatting
npm run lint                 # ESLint
npm run lint:fix             # ESLint with auto-fix
npm run format               # Prettier formatting
npm run format:check         # Check formatting without changes

# Database migrations
npm run migratedb            # Run migrations
npm run migratedb:overwrite  # Run migrations with checksum update
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

### Playwright MCP

**Always use subagents for Playwright browser automation.** Direct Playwright usage fills context extremely fast (screenshots, DOM snapshots, navigation steps). Launch a subagent to do the browser work, then have it return a concise summary. This preserves main conversation context for actual development work. **Prefer `model: "haiku"`** for simple tasks (screenshots, clicking, form filling). Use sonnet for tasks requiring analysis or judgment.

### Test Suite

Provider tests hit real websites and verify extraction works:

```bash
npm run test                     # All tests
npm run testGH                   # Exclude flaky provider tests (for CI)
```

Test structure:
- `test/provider/testProvider.json` - Test URLs for each provider
- `test/provider/<name>.test.js` - Integration tests per provider
- `test/utils.js` - Mock utilities (storage, notifications)

## Git Workflow

- **Main branch is protected** — all changes require PRs
- **beads-sync branch** — dedicated branch for `bd sync` commits
- Feature work: create feature branch from master, PR when done
- Beads sync: `bd sync` pushes to `beads-sync`, periodically merge to master via PR

## Worktrees & Beads

### Long-Running Tasks
When gaining new insights on complex or multi-session tasks, write them into the issue's comments (`bd comments <id> --add "..."`) so context isn't lost when continuing later.

### Creating Worktrees
From main repo only:
```bash
git worktree add ../fredy-ch-<name> -b <name>/work
```

### Key Points
- Beads is initialized in main repo only — worktrees share it automatically
- Don't run `bd init` in worktrees
- Don't create symlinks or copy `.beads/`
- Run Claude instances from worktrees, not main repo

### Known Issue: `bd doctor` in Worktrees
**`bd doctor` shows "No .beads/ directory found" error in worktrees — this is a false positive.**

Other commands (`bd list`, `bd sync`, `bd ready`, etc.) work correctly because they find the main repo's `.beads/` automatically. Only `bd doctor` fails to detect worktree mode.

- **Workaround**: Run `bd doctor` from the main repo (`fredy-ch/`), not from worktrees
- **Tracking**: https://github.com/steveyegge/beads/issues/747

### Removing Worktrees
```bash
git worktree remove ../fredy-ch-<name>
git branch -D <name>/work  # if deleting branch too
```

## Deployment

Production runs on **Railway**. CLI available locally. Volume mounted at `/db`.

## Notes
- Node.js 22+ required
- Default login: admin/admin
- Frontend proxies `/api` to backend on port 9998 during development

## Swiss Providers (TODO)
- ImmoScout24.ch - Swiss real estate platform (different from German ImmoScout24.de)
- Homegate.ch - Largest Swiss platform
- Flatfox.ch - Modern Swiss platform
