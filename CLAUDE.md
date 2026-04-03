# Fredy — Development Guide

## Spec-Driven Development with OpenSpec

Every PR in this repo MUST start with a planning phase using [OpenSpec](https://github.com/Fission-AI/OpenSpec). Write the spec before the code.

### Workflow

1. **Propose** — Create `openspec/changes/<change-name>/proposal.md` describing the problem, intent, approach, and scope.
2. **Spec** — Write delta specs in `openspec/changes/<change-name>/specs/<domain>/spec.md` using ADDED/MODIFIED/REMOVED sections with requirements (SHALL/MUST/SHOULD) and Given-When-Then scenarios.
3. **Design** — Create `openspec/changes/<change-name>/design.md` with architecture decisions, key trade-offs, and diagrams.
4. **Tasks** — Create `openspec/changes/<change-name>/tasks.md` with a checklist of implementation steps.
5. **Implement** — Write tests first (TDD), then code. Check off tasks as completed.
6. **Archive** — When done, move the change folder to `openspec/archive/<change-name>/` and merge delta specs into `openspec/specs/<domain>/spec.md`.

### Directory Structure

```
openspec/
├── specs/           # Authoritative specs (current system behavior)
│   └── <domain>/
│       └── spec.md
├── changes/         # Active work (proposals in progress)
│   └── <change-name>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/
│           └── <domain>/
│               └── spec.md    # Delta spec (ADDED/MODIFIED/REMOVED)
└── archive/         # Completed changes
    └── <change-name>/
        ├── proposal.md
        ├── design.md
        ├── tasks.md
        └── specs/
```

### Spec Format

Requirements use RFC 2119 keywords:
```markdown
### REQ-DOMAIN-001: Short Name
The system SHALL do something specific.
```

Scenarios use Given-When-Then:
```markdown
#### Scenario: Happy path
- GIVEN some precondition
- WHEN an action occurs
- THEN the expected outcome happens
```

Delta specs label changes:
```markdown
## ADDED Requirements
### REQ-X-001: New behavior
...

## MODIFIED Requirements
### REQ-X-002: Changed behavior
(Previously: old behavior)

## REMOVED Requirements
### REQ-X-003: Deprecated behavior
```

## Code Conventions

- **ES Modules** — `"type": "module"`, all imports use ESM syntax
- **ESLint** must pass (`yarn lint`) — enforced by pre-commit hook
- **Prettier** formatting: single quotes, 120 char print width — auto-applied by pre-commit hook
- **`no-console` rule** — only `console.warn` and `console.error` allowed; use `logger` for other logging
- **`fetch` is a global** in ESLint config — no need to import for native fetch
- **Node.js** — `>=22.0.0`

## Testing

- **Framework**: Vitest — globals enabled (`describe`, `it`, `vi` available without import)
- **Import**: `import { expect } from 'vitest'` (expect is not a global)
- **Test location**: `test/` directory mirroring source structure
- **File pattern**: `*.test.js`
- **Timeout**: 60s per test (configured globally)
- **Run**: `yarn test` (or `npx vitest run`)
- **TDD**: Write tests before implementation for new modules
- **Mocking**: `vi.mock()` at top level, `vi.hoisted()` for mock variables used in factories, `vi.doMock()` + `vi.resetModules()` for per-test isolation
