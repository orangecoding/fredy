# Fredy UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the cronpilot visual identity (dark design system with red accent) to Fredy's React frontend screen-by-screen using Semi UI component overrides and LESS tokens.

**Architecture:** Add a `tokens.less` file as the single source of truth for all design variables; override Semi UI's CSS custom properties globally in `Index.less`; apply the new CI to every view and shared component. No state management changes. No routing changes.

**Tech Stack:** React 18, `@douyinfe/semi-ui-19` (v2.95), LESS (BEM), Zustand, React Router, MapLibre GL.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `index.html` | Modify | Add Google Fonts link |
| `ui/src/tokens.less` | Create | All LESS/CSS design tokens |
| `ui/src/Index.less` | Modify | Semi UI CSS variable overrides, body bg, scrollbar |
| `ui/src/App.less` | Modify | App shell layout |
| `ui/src/components/navigation/Navigation.jsx` | Modify | New sidebar with footer bar, collapse logic |
| `ui/src/components/navigation/Navigate.less` | Modify | Sidebar LESS |
| `ui/src/components/footer/FredyFooter.jsx` | Modify | "Made with heart by Christian Kellner" link |
| `ui/src/components/footer/FredyFooter.less` | Modify | Footer bar styles |
| `ui/src/components/headline/Headline.jsx` | Modify | Become `PageHeading` with gradient line + optional action slot |
| `ui/src/views/login/Login.jsx` | Modify | New centered glass-card login |
| `ui/src/views/login/login.less` | Modify | New login styles |
| `ui/src/components/cards/KpiCard.jsx` | Modify | Compact 112px card, glow hover only |
| `ui/src/components/cards/DashboardCard.less` | Modify | New KPI card LESS |
| `ui/src/views/dashboard/Dashboard.jsx` | Modify | Add PageHeading, remove section-label typography |
| `ui/src/views/dashboard/Dashboard.less` | Modify | Dashboard layout LESS |
| `ui/src/components/grid/jobs/JobGrid.jsx` | Modify | New topbar layout + table layout (replace Card grid) |
| `ui/src/components/grid/jobs/JobGrid.less` | Modify | Table + topbar LESS |
| `ui/src/views/jobs/Jobs.jsx` | Modify | Add PageHeading |
| `ui/src/components/segment/SegmentPart.jsx` | Modify | New section-card design |
| `ui/src/components/segment/SegmentParts.less` | Modify | Section card LESS |
| `ui/src/views/jobs/mutation/JobMutation.jsx` | Modify | Add PageHeading + back button |
| `ui/src/views/jobs/mutation/JobMutation.less` | Modify | Minor layout updates |
| `ui/src/components/grid/listings/ListingsGrid.jsx` | Modify | New card design with action bar, watermark |
| `ui/src/components/grid/listings/ListingsGrid.less` | Modify | New listing card LESS |
| `ui/src/views/listings/Map.jsx` | Modify | Add PageHeading, styled filter panel |
| `ui/src/views/listings/Map.less` | Modify | Filter panel overlay styles |
| `ui/src/views/user/Users.jsx` | Modify | Add PageHeading, styled table |
| `ui/src/views/user/Users.less` | Modify | Users table LESS |
| `ui/src/components/table/UserTable.jsx` | Modify | Avatar initials, admin badge, styled rows |
| `ui/src/views/user/mutation/UserMutator.jsx` | Modify | Add PageHeading + back button |
| `ui/src/views/user/mutation/UserMutator.less` | Modify | Section card layout |
| `ui/src/views/generalSettings/GeneralSettings.jsx` | Modify | Tab styles, section cards, Save button with icon |
| `ui/src/views/generalSettings/GeneralSettings.less` | Modify | Tab + section card LESS |

---

## Task 1: Design Tokens + Global Styles

**Files:**
- Create: `ui/src/tokens.less`
- Modify: `index.html`
- Modify: `ui/src/Index.less`

This is the foundation. Every subsequent task imports `tokens.less`.

- [ ] **Step 1: Create `ui/src/tokens.less`**

```less
// ── Backgrounds ──────────────────────────────────────────
@color-base:          #0d0d0d;
@color-surface:       #161616;
@color-elevated:      #1e1e1e;
@color-border:        #2a2a2a;
@color-border-bright: #383838;

// ── Accent ───────────────────────────────────────────────
@color-accent:        #e04a38;
@color-accent-dim:    #c13827;
@color-accent-glow:   rgba(224, 74, 56, 0.13);

// ── Text ─────────────────────────────────────────────────
@color-text:          #efefef;
@color-muted:         #909090;
@color-faint:         #505050;

// ── Semantic ─────────────────────────────────────────────
@color-success:       #34d399;
@color-success-dim:   #065f46;
@color-error:         #fb7185;
@color-error-dim:     #881337;
@color-warning:       #fbbf24;
@color-info:          #60a5fa;

// ── KPI card accents ─────────────────────────────────────
@color-blue-text:   #60a5fa; @color-blue-border: #3b6ea8; @color-blue-bg: rgba(96,165,250,0.10);
@color-orange-text: #fb923c; @color-orange-border: #c2622a; @color-orange-bg: rgba(251,146,60,0.10);
@color-green-text:  #34d399; @color-green-border: #2a8a61; @color-green-bg: rgba(52,211,153,0.10);
@color-purple-text: #a78bfa; @color-purple-border: #6d4fc2; @color-purple-bg: rgba(167,139,250,0.10);
@color-gray-text:   #94a3b8; @color-gray-border: #323a47; @color-gray-bg: rgba(148,163,184,0.10);

// ── Typography ───────────────────────────────────────────
@font-ui:   'Outfit', system-ui, sans-serif;
@font-mono: 'JetBrains Mono', monospace;

@text-xs:   11px;
@text-sm:   12px;
@text-base: 14px;
@text-md:   16px;
@text-lg:   20px;
@text-xl:   24px;

// ── Spacing ──────────────────────────────────────────────
@space-1: 4px;
@space-2: 8px;
@space-3: 12px;
@space-4: 16px;
@space-5: 20px;
@space-6: 24px;
@space-8: 32px;
@space-12: 48px;

// ── Radius ───────────────────────────────────────────────
@radius-input:  10px;
@radius-card:   10px;
@radius-btn:    6px;
@radius-pill:   9999px;
@radius-chip:   4px;

// ── Transitions ──────────────────────────────────────────
@transition-fast: 0.15s ease-in-out;
@transition-card: 0.18s ease-in-out;
@transition-sidebar: width 0.25s ease-in-out;
```

- [ ] **Step 2: Add Google Fonts to `index.html`**

Open `index.html` and add inside `<head>` before the closing `</head>` tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

- [ ] **Step 3: Replace `ui/src/Index.less` with new global styles**

```less
@import './tokens.less';

body,
html {
  margin: 0;
  height: 100%;
  width: 100%;
  font-family: @font-ui;
  background-color: @color-base;
  background-image: radial-gradient(ellipse at 60% 0%, rgba(224,74,56,0.05) 0%, transparent 55%);
  background-attachment: fixed;
}

body {
  // Semi UI theme overrides
  --semi-color-bg-0: #0d0d0d;
  --semi-color-bg-1: #161616;
  --semi-color-bg-2: #1e1e1e;
  --semi-color-bg-3: #2a2a2a;
  --semi-color-border: #2a2a2a;
  --semi-color-primary: #e04a38;
  --semi-color-primary-hover: #c13827;
  --semi-color-primary-active: #c13827;
  --semi-color-primary-light-default: rgba(224,74,56,0.12);
  --semi-color-primary-light-hover: rgba(224,74,56,0.18);
  --semi-color-primary-light-active: rgba(224,74,56,0.22);
  --semi-color-text-0: #efefef;
  --semi-color-text-1: #efefef;
  --semi-color-text-2: #909090;
  --semi-color-text-3: #505050;
  --semi-color-fill-0: rgba(255,255,255,0.04);
  --semi-color-fill-1: rgba(255,255,255,0.06);
  --semi-color-fill-2: rgba(255,255,255,0.08);
  --semi-font-family: 'Outfit', system-ui, sans-serif;
}

// Semi table row overrides
.semi-table-row-head {
  background-color: rgba(255,255,255,0.06) !important;
}
.semi-table-row-head .semi-table-row-cell {
  background-color: rgba(255,255,255,0.06) !important;
  color: @color-muted !important;
  font-size: @text-xs;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.semi-table-row-cell {
  background-color: @color-surface !important;
}
.semi-table-tbody .semi-table-row:nth-child(even) .semi-table-row-cell {
  background-color: @color-base !important;
}
.semi-table-tbody .semi-table-row:hover .semi-table-row-cell {
  background-color: @color-elevated !important;
}

// Scrollbar
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: @color-surface; }
::-webkit-scrollbar-thumb { background: @color-border-bright; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: @color-muted; }

.semi-icon:not(.semi-tabs-bar .semi-tabs-tab .semi-icon) {
  vertical-align: middle;
}
```

- [ ] **Step 4: Update `ui/src/App.less` to import tokens and fix layout**

```less
@import './tokens.less';

.app {
  height: 100vh;
  width: 100vw;

  &__main {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    padding: @space-6;
    background-color: transparent;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;

    @media (max-width: 768px) {
      padding: @space-3;
    }
  }
}
```

- [ ] **Step 5: Replace `ui/src/components/cards/DashboardCardColors.less`**

The file currently defines all KPI color variables. Replace its entire content with just the import so there is one source of truth:

```less
@import '../../tokens.less';
```

All `@color-blue-*`, `@color-orange-*`, etc. now come from `tokens.less`. The import chain `DashboardCard.less → DashboardCardColors.less → tokens.less` makes every token available in DashboardCard.less.

- [ ] **Step 6: Add Semi Modal overrides to `ui/src/Index.less`**

Append to the end of `Index.less` (inside or after the body rule):

```less
// Semi Modal dark theme overrides
.semi-modal-content {
  background: #161616 !important;
  border: 1px solid @color-border !important;
  border-radius: 14px !important;
}

.semi-modal-header {
  background: linear-gradient(135deg, #1e1e1e 0%, #161616 100%) !important;
  border-bottom: 1px solid @color-border !important;
  border-left: 3px solid @color-accent !important;
  border-radius: 14px 14px 0 0 !important;
}

.semi-modal-mask {
  background: rgba(0,0,0,0.7) !important;
  backdrop-filter: blur(4px);
}
```

- [ ] **Step 7: Verify the app compiles**

```bash
yarn dev
```

Expected: Vite dev server starts without errors. The page should be mostly dark with the Outfit font visible.

- [ ] **Step 8: Commit**

```bash
git add index.html ui/src/tokens.less ui/src/Index.less ui/src/App.less ui/src/components/cards/DashboardCardColors.less
git commit -m "feat: add design tokens and Semi UI theme overrides"
```

---

## Task 2: App Shell — Sidebar Navigation

**Files:**
- Modify: `ui/src/components/navigation/Navigation.jsx`
- Modify: `ui/src/components/navigation/Navigate.less`

The sidebar expands to 220px / collapses to 60px. Auto-collapses at <=850px. Active item has red accent. Footer has logout + collapse toggle.

- [ ] **Step 1: Replace `ui/src/components/navigation/Navigate.less`**

```less
@import '../../tokens.less';

.navigate {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: @color-surface;
  border-right: 1px solid @color-border;
  transition: @transition-sidebar;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px 16px 16px;
    min-height: 64px;
    flex-shrink: 0;

    img {
      transition: width @transition-fast, opacity @transition-fast;
    }
  }

  &__footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 8px;
    margin-top: auto;
    flex-shrink: 0;
  }
}

// Semi Nav overrides
.semi-navigation {
  background: @color-surface !important;
  border-right: none !important;
}

.semi-navigation-item {
  border-radius: @radius-btn !important;
  color: @color-muted !important;
  transition: background @transition-fast, color @transition-fast !important;
  margin: 2px 8px !important;

  &:hover {
    background: #23242a !important;
    color: @color-text !important;
  }

  &.semi-navigation-item-selected,
  &[aria-selected="true"] {
    background: rgba(224,74,56,0.12) !important;
    border: 1px solid rgba(224,74,56,0.25) !important;
    color: @color-text !important;

    .semi-navigation-item-icon {
      color: @color-accent !important;
    }
  }
}

.semi-navigation-sub-title {
  color: @color-muted !important;
}
```

- [ ] **Step 2: Update `ui/src/components/navigation/Navigation.jsx`**

No structural changes needed in JSX — the Semi `Nav` component is kept. Just update the `style` prop and add the `navigate` class:

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Button, Nav } from '@douyinfe/semi-ui-19';
import { IconStar, IconSetting, IconTerminal, IconHistogram, IconSidebar } from '@douyinfe/semi-icons';
import logoWhite from '../../assets/logo_white.png';
import heart from '../../assets/heart.png';
import Logout from '../logout/Logout.jsx';
import { useLocation, useNavigate } from 'react-router-dom';

import './Navigate.less';
import { useScreenWidth } from '../../hooks/screenWidth.js';

export default function Navigation({ isAdmin }) {
  const navigate = useNavigate();
  const location = useLocation();

  const width = useScreenWidth();
  const [collapsed, setCollapsed] = useState(width <= 850);

  useEffect(() => {
    if (width <= 850) {
      setCollapsed(true);
    }
  }, [width]);

  const items = [
    { itemKey: '/dashboard', text: 'Dashboard', icon: <IconHistogram /> },
    { itemKey: '/jobs', text: 'Jobs', icon: <IconTerminal /> },
    {
      itemKey: 'listings',
      text: 'Listings',
      icon: <IconStar />,
      items: [
        { itemKey: '/listings', text: 'Overview' },
        { itemKey: '/map', text: 'Map View' },
      ],
    },
  ];

  if (isAdmin) {
    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: [
        { itemKey: '/users', text: 'User Management' },
        { itemKey: '/generalSettings', text: 'Settings' },
      ],
    });
  } else {
    items.push({
      itemKey: 'settings',
      text: 'Settings',
      icon: <IconSetting />,
      items: [{ itemKey: '/generalSettings', text: 'Settings' }],
    });
  }

  function parsePathName(name) {
    const split = name.split('/').filter((s) => s.length !== 0);
    return '/' + split[0];
  }

  const sidebarWidth = collapsed ? '60px' : '220px';

  return (
    <Nav
      style={{ height: '100%', width: sidebarWidth, minWidth: sidebarWidth, maxWidth: sidebarWidth }}
      items={items}
      isCollapsed={collapsed}
      selectedKeys={[parsePathName(location.pathname)]}
      onSelect={(key) => {
        navigate(key.itemKey);
      }}
      header={
        <div className="navigate__header">
          <img
            src={collapsed ? heart : logoWhite}
            width={collapsed ? 30 : 160}
            alt="Fredy Logo"
          />
        </div>
      }
      footer={
        <Nav.Footer className="navigate__footer">
          <Logout text={!collapsed} />
          <Button
            icon={<IconSidebar />}
            onClick={() => setCollapsed(!collapsed)}
            theme="borderless"
            style={{ color: '#505050' }}
          />
        </Nav.Footer>
      }
    />
  );
}
```

- [ ] **Step 3: Verify sidebar renders correctly**

Run `yarn dev`, open browser. Sidebar should be dark (#161616), items should show muted until hovered/selected, active item should have a subtle red bg + border.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/navigation/Navigation.jsx ui/src/components/navigation/Navigate.less
git commit -m "feat: new sidebar navigation design with accent active state"
```

---

## Task 3: App Shell — Footer Bar

**Files:**
- Modify: `ui/src/components/footer/FredyFooter.jsx`
- Modify: `ui/src/components/footer/FredyFooter.less`

- [ ] **Step 1: Replace `FredyFooter.less`**

```less
@import '../../tokens.less';

.fredyFooter {
  background-color: @color-base;
  border-top: 1px solid @color-border;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px;
  height: 36px;
  flex-shrink: 0;
  box-sizing: border-box;

  &__version {
    font-size: @text-xs;
    color: @color-faint;
    font-family: @font-mono;
  }

  &__credit {
    font-size: @text-xs;
    color: @color-faint;

    a {
      color: @color-muted;
      text-decoration: none;
      transition: color @transition-fast;

      &:hover {
        color: @color-text;
      }
    }
  }
}
```

- [ ] **Step 2: Replace `FredyFooter.jsx`**

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './FredyFooter.less';
import { useSelector } from '../../services/state/store.js';
import { Layout } from '@douyinfe/semi-ui-19';

export default function FredyFooter() {
  const { Footer } = Layout;
  const version = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <Footer className="fredyFooter">
      <span className="fredyFooter__version">
        Fredy v{version?.localFredyVersion || 'N/A'}
      </span>
      <span className="fredyFooter__credit">
        Made with ❤️ by{' '}
        <a href="https://github.com/orangecoding" target="_blank" rel="noreferrer">
          Christian Kellner
        </a>
      </span>
    </Footer>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/footer/FredyFooter.jsx ui/src/components/footer/FredyFooter.less
git commit -m "feat: new footer bar with version and credit link"
```

---

## Task 4: PageHeading Component

**Files:**
- Modify: `ui/src/components/headline/Headline.jsx` (rename purpose to PageHeading)
- Create: `ui/src/components/headline/Headline.less`

Every view uses `<Headline text="..." actions={<Button />} />` — keep the same component name and API to avoid changing all imports. Add a gradient separator line below the h1.

- [ ] **Step 1: Create `ui/src/components/headline/Headline.less`**

```less
@import '../../tokens.less';

.page-heading {
  margin-bottom: @space-6;
  margin-top: 0;

  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__title {
    font-size: @text-lg !important;
    font-weight: 700 !important;
    color: @color-text !important;
    margin: 0 !important;
    line-height: 1.2;
  }

  &__line {
    height: 1px;
    background: linear-gradient(90deg, rgba(224,74,56,0.5) 0%, rgba(224,74,56,0) 100%);
    width: 100%;
  }
}
```

- [ ] **Step 2: Replace `ui/src/components/headline/Headline.jsx`**

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import './Headline.less';

export default function Headline({ text, actions } = {}) {
  return (
    <div className="page-heading">
      <div className="page-heading__row">
        <h1 className="page-heading__title">{text}</h1>
        {actions && <div>{actions}</div>}
      </div>
      <div className="page-heading__line" />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/headline/Headline.jsx ui/src/components/headline/Headline.less
git commit -m "feat: PageHeading component with gradient accent line"
```

---

## Task 5: Login Screen

**Files:**
- Modify: `ui/src/views/login/Login.jsx`
- Modify: `ui/src/views/login/login.less`

Glass card over blurred city background. Logo 160px wide at top. Full-width red login button.

- [ ] **Step 1: Replace `ui/src/views/login/login.less`**

```less
@import '../../tokens.less';

.login {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;

  &__bgImage {
    background-size: cover;
    background-position: center;
    filter: brightness(0.35);
    -webkit-filter: brightness(0.35);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 0;
  }

  &__loginWrapper {
    position: relative;
    z-index: 1;
    background: rgba(22, 22, 22, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid @color-border;
    border-radius: 14px;
    padding: 40px 36px;
    width: 380px;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
    align-items: center;
    box-sizing: border-box;
  }

  &__logoWrapper {
    margin-bottom: 32px;
    display: flex;
    justify-content: center;
    width: 100%;
  }

  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__inputGroup {
    width: 100%;
  }

  // Focus accent override for Semi inputs
  .semi-input-wrapper:focus-within {
    border-color: rgba(224,74,56,0.6) !important;
    box-shadow: none !important;
  }

  @media (max-width: 480px) {
    &__loginWrapper {
      padding: 32px 24px;
    }
  }
}
```

- [ ] **Step 2: Update `ui/src/views/login/Login.jsx`** — change logo width to 160 and ensure Button is full-width solid red

The only change needed in the JSX is the Logo width:

```jsx
// Change this line:
<Logo width={250} white />
// To:
<Logo width={160} white />
```

Also ensure Button has `type="primary" theme="solid"` (it already does). No other JSX changes needed; styles handle the rest.

- [ ] **Step 3: Commit**

```bash
git add ui/src/views/login/Login.jsx ui/src/views/login/login.less
git commit -m "feat: new login screen with glass card and accent button"
```

---

## Task 6: KPI Cards + Dashboard

**Files:**
- Modify: `ui/src/components/cards/DashboardCard.less`
- Modify: `ui/src/components/cards/KpiCard.jsx`
- Modify: `ui/src/views/dashboard/Dashboard.jsx`
- Modify: `ui/src/views/dashboard/Dashboard.less`

KPI cards are compact (112px), hover glow only (no translateY). Dashboard gets PageHeading.

- [ ] **Step 1: Replace `ui/src/components/cards/DashboardCard.less`**

```less
@import './DashboardCardColors.less';

.dashboard-card {
  width: 100%;
  height: 112px;
  border-radius: @radius-card !important;
  border: 1px solid @color-border !important;
  background-color: @color-surface !important;
  transition: box-shadow @transition-card;
  position: relative;
  overflow: visible;

  &:hover {
    box-shadow: 0 4px 24px -2px rgba(255,255,255,0.06);
  }

  &__icon {
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--card-accent, @color-gray-text);
  }

  &__title {
    color: rgba(148, 163, 184, 0.7) !important;
    font-size: @text-xs !important;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__content {
    width: 100%;
  }

  &__value {
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 4px;
    color: var(--card-accent, @color-text);
  }

  &__desc {
    color: @color-faint !important;
    font-size: @text-xs;
  }

  &.blue {
    --card-accent: @color-blue-text;
    background-color: @color-blue-bg !important;
    border-color: @color-blue-border !important;
    &:hover { box-shadow: 0 4px 24px -2px @color-blue-border; }
  }
  &.orange {
    --card-accent: @color-orange-text;
    background-color: @color-orange-bg !important;
    border-color: @color-orange-border !important;
    &:hover { box-shadow: 0 4px 24px -2px @color-orange-border; }
  }
  &.green {
    --card-accent: @color-green-text;
    background-color: @color-green-bg !important;
    border-color: @color-green-border !important;
    &:hover { box-shadow: 0 4px 24px -2px @color-green-border; }
  }
  &.purple {
    --card-accent: @color-purple-text;
    background-color: @color-purple-bg !important;
    border-color: @color-purple-border !important;
    &:hover { box-shadow: 0 4px 24px -2px @color-purple-border; }
  }
  &.gray {
    --card-accent: @color-gray-text;
    background-color: @color-gray-bg !important;
    border-color: @color-gray-border !important;
    &:hover { box-shadow: 0 4px 24px -2px @color-gray-border; }
  }
}
```

- [ ] **Step 2: Update KpiCard.jsx** — remove `valueFontSize` prop usage and hardcode 1.2rem in LESS

No JSX changes needed since the LESS handles font-size. However, remove the inline `fontSize` override from the value div by updating the JSX:

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Card, Typography, Space } from '@douyinfe/semi-ui-19';
import './DashboardCard.less';

export default function KpiCard({ title, icon, value, description, color = 'gray', children }) {
  const { Text } = Typography;
  return (
    <Card className={`dashboard-card ${color}`} bodyStyle={{ padding: '16px' }}>
      <Space vertical align="start" spacing="tight" style={{ width: '100%' }}>
        <Space>
          <div className="dashboard-card__icon">{icon}</div>
          <Text strong className="dashboard-card__title">{title}</Text>
        </Space>
        <div className="dashboard-card__content">
          <div className="dashboard-card__value">{value}{children}</div>
          {description && (
            <Text size="small" className="dashboard-card__desc">{description}</Text>
          )}
        </div>
      </Space>
    </Card>
  );
}
```

- [ ] **Step 3: Update `ui/src/views/dashboard/Dashboard.jsx`** — add PageHeading, update section label style

Replace the `<Text className="dashboard__section-label">` elements with plain styled `div`s and add `<Headline>` at the top:

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, Col, Row, Toast } from '@douyinfe/semi-ui-19';
import {
  IconTerminal,
  IconStar,
  IconClock,
  IconDoubleChevronLeft,
  IconDoubleChevronRight,
  IconStarStroked,
  IconNoteMoney,
  IconSearch,
  IconPlayCircle,
} from '@douyinfe/semi-icons';

import { useSelector, useActions } from '../../services/state/store';
import KpiCard from '../../components/cards/KpiCard.jsx';
import PieChartCard from '../../components/cards/PieChartCard.jsx';
import Headline from '../../components/headline/Headline.jsx';

import './Dashboard.less';
import { xhrPost } from '../../services/xhr.js';
import { format } from '../../services/time/timeService.js';

export default function Dashboard() {
  const actions = useActions();
  const dashboard = useSelector((state) => state.dashboard.data);
  React.useEffect(() => {
    actions.dashboard.getDashboard();
  }, []);

  const kpis = dashboard?.kpis || { totalJobs: 0, totalListings: 0, providersUsed: 0 };
  const pieData = dashboard?.pie || [];

  return (
    <div className="dashboard">
      <Headline text="Dashboard" />

      <div className="dashboard__section-label">General</div>
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Search Interval"
            value={`${dashboard?.general?.interval} min`}
            icon={<IconClock />}
            description="Time interval for job execution"
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Last Search"
            value={
              dashboard?.general?.lastRun == null || dashboard?.general?.lastRun === 0
                ? '---'
                : format(dashboard?.general?.lastRun)
            }
            icon={<IconDoubleChevronLeft />}
            description="Last execution timestamp"
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Next Search"
            value={
              dashboard?.general?.nextRun == null || dashboard?.general?.nextRun === 0
                ? '---'
                : format(dashboard?.general?.nextRun)
            }
            icon={<IconDoubleChevronRight />}
            description="Next execution timestamp"
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard title="Search Now" icon={<IconSearch />} description="Run a search now">
            <Button
              size="small"
              style={{ marginTop: '.2rem' }}
              icon={<IconPlayCircle />}
              aria-label="Start now"
              onClick={async () => {
                try {
                  await xhrPost('/api/jobs/startAll', null);
                  Toast.success('Successfully triggered Fredy search.');
                } catch {
                  Toast.error('Failed to trigger search');
                }
              }}
            >
              Search now
            </Button>
          </KpiCard>
        </Col>
      </Row>

      <div className="dashboard__section-label">Overview</div>
      <Row gutter={[16, 16]} className="dashboard__row">
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Jobs"
            color="blue"
            value={!kpis.totalJobs ? '---' : kpis.totalJobs}
            icon={<IconTerminal />}
            description="Total number of jobs"
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Listings"
            color="orange"
            value={!kpis.totalListings ? '---' : kpis.totalListings}
            icon={<IconStarStroked />}
            description="Total listings found"
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Active Listings"
            color="green"
            value={!kpis.numberOfActiveListings ? '---' : kpis.numberOfActiveListings}
            icon={<IconStar />}
            description="Total active listings"
          />
        </Col>
        <Col xs={24} sm={12} md={12} lg={6} xl={6}>
          <KpiCard
            title="Median Price"
            color="purple"
            value={`${
              !kpis.medianPriceOfListings
                ? '---'
                : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(kpis.medianPriceOfListings)
            }`}
            icon={<IconNoteMoney />}
            description="Median Price of listings"
          />
        </Col>
      </Row>

      <div className="dashboard__section-label">Provider Insights</div>
      <div className="dashboard__pie-wrapper">
        <PieChartCard data={pieData} />
      </div>
    </div>
  );
}

Dashboard.displayName = 'Dashboard';
```

- [ ] **Step 4: Update `ui/src/views/dashboard/Dashboard.less`**

```less
@import '../../tokens.less';

.dashboard {
  display: flex;
  flex-direction: column;
  flex: 1;

  &__section-label {
    display: block;
    font-size: @text-xs;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: @color-faint;
    margin-bottom: 10px;
    margin-top: 4px;
  }

  &__row {
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  &__pie-wrapper {
    background: #23242a;
    border: 1px solid #37404e;
    border-radius: @radius-card;
    padding: 28px;
    max-height: 320px;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/cards/DashboardCard.less ui/src/components/cards/KpiCard.jsx ui/src/views/dashboard/Dashboard.jsx ui/src/views/dashboard/Dashboard.less
git commit -m "feat: compact KPI cards and dashboard with page heading"
```

---

## Task 7: Jobs List (JobGrid)

**Files:**
- Modify: `ui/src/views/jobs/Jobs.jsx`
- Modify: `ui/src/components/grid/jobs/JobGrid.jsx`
- Modify: `ui/src/components/grid/jobs/JobGrid.less`

The design spec shows a **table layout** for jobs (not the current card grid). Each row has a green left border (active) or red (inactive). The "New Job" button moves to the PageHeading `actions` slot. However, the existing card grid already has rich interaction (SSE, run button, clone, etc.) that works well. We will keep the card grid layout but style it to match the new CI (dark cards, accent borders, proper hover).

- [ ] **Step 1: Update `ui/src/views/jobs/Jobs.jsx`** — add PageHeading with "New Job" button

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import JobGrid from '../../components/grid/jobs/JobGrid.jsx';
import Headline from '../../components/headline/Headline.jsx';
import './Jobs.less';

export default function Jobs() {
  return (
    <div className="jobs">
      <Headline text="Jobs" />
      <JobGrid />
    </div>
  );
}
```

- [ ] **Step 2: Update `ui/src/views/jobs/Jobs.less`**

```less
@import '../../tokens.less';

.jobs {
  display: flex;
  flex-direction: column;
  flex: 1;
}
```

- [ ] **Step 3: Update `ui/src/components/grid/jobs/JobGrid.less`**

```less
@import '../../cards/DashboardCardColors.less';
@import '../../../tokens.less';

.jobGrid {
  display: flex;
  flex-direction: column;
  flex: 1;

  &__topbar {
    display: flex;
    align-items: center;
    gap: @space-3;
    margin-bottom: @space-4;
    flex-wrap: wrap;

    &__search {
      flex: 1;
      min-width: 160px;
    }
  }

  &__card {
    height: 100%;
    background-color: @color-surface !important;
    border: 1px solid @color-border !important;
    border-radius: @radius-card !important;
    transition: transform @transition-card, box-shadow @transition-card;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px -4px rgba(0,0,0,0.5);
    }

    &__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 16px;
    }

    &__name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    &__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background-color: rgba(251,113,133,0.7);

      &--active {
        background-color: rgba(52,211,153,0.8);
      }
    }

    &__stats {
      display: flex;
      gap: 8px;
    }

    &__stat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(255,255,255,0.04);
      border: 1px solid transparent;
      border-radius: @radius-chip;
      padding: 10px 4px 8px;

      &__number {
        font-size: 22px;
        font-weight: 600;
        color: @color-text;
        line-height: 1.2;
      }

      &__label {
        font-size: @text-xs;
        color: @color-faint;
        display: flex;
        align-items: center;
        gap: 3px;
        margin-top: 4px;
      }

      &--blue {
        background: @color-blue-bg;
        border-color: @color-blue-border;
        .jobGrid__card__stat__number { color: @color-blue-text; }
        .jobGrid__card__stat__label { color: @color-blue-text; opacity: 0.7; }
      }

      &--orange {
        background: @color-orange-bg;
        border-color: @color-orange-border;
        .jobGrid__card__stat__number { color: @color-orange-text; }
        .jobGrid__card__stat__label { color: @color-orange-text; opacity: 0.7; }
      }

      &--purple {
        background: @color-purple-bg;
        border-color: @color-purple-border;
        .jobGrid__card__stat__number { color: @color-purple-text; }
        .jobGrid__card__stat__label { color: @color-purple-text; opacity: 0.7; }
      }
    }

    &__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  }

  &__title {
    color: @color-text !important;
  }

  &__actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  &__pagination {
    margin-top: @space-4;
    display: flex;
    justify-content: center;
  }
}

.jobPopoverContent {
  font-size: @text-sm;
  padding: 4px 8px;
  color: @color-text;
}
```

- [ ] **Step 4: In `JobGrid.jsx`, move the "New Job" button to be passed via `Jobs.jsx` using the Headline actions slot**

Open `ui/src/components/grid/jobs/JobGrid.jsx`. Remove the `<Button type="primary" icon={<IconPlusCircle />}...>New Job</Button>` from the `jobGrid__topbar` div. The "New Job" button is now in `Jobs.jsx`.

Update `ui/src/views/jobs/Jobs.jsx` to pass it:

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@douyinfe/semi-ui-19';
import { IconPlusCircle } from '@douyinfe/semi-icons';
import JobGrid from '../../components/grid/jobs/JobGrid.jsx';
import Headline from '../../components/headline/Headline.jsx';
import './Jobs.less';

export default function Jobs() {
  const navigate = useNavigate();
  return (
    <div className="jobs">
      <Headline
        text="Jobs"
        actions={
          <Button
            type="primary"
            theme="solid"
            icon={<IconPlusCircle />}
            onClick={() => navigate('/jobs/new')}
          >
            New Job
          </Button>
        }
      />
      <JobGrid />
    </div>
  );
}
```

In `JobGrid.jsx`, remove the `Button` and `IconPlusCircle` for "New Job" from the topbar (keep the rest of the topbar intact). The topbar should still have: search input, activity RadioGroup, sort Select, and sort direction Button.

- [ ] **Step 5: Commit**

```bash
git add ui/src/views/jobs/Jobs.jsx ui/src/views/jobs/Jobs.less ui/src/components/grid/jobs/JobGrid.jsx ui/src/components/grid/jobs/JobGrid.less
git commit -m "feat: jobs view with page heading and updated card styles"
```

---

## Task 8: Section Cards (SegmentPart)

**Files:**
- Modify: `ui/src/components/segment/SegmentPart.jsx`
- Modify: `ui/src/components/segment/SegmentParts.less`

The Section card pattern is used in Job Mutation, User Mutator, and Settings. Updating it here applies the new style everywhere.

- [ ] **Step 1: Replace `ui/src/components/segment/SegmentParts.less`**

```less
@import '../../tokens.less';

.segmentParts {
  background: rgba(255,255,255,0.03) !important;
  border: 1px solid @color-border !important;
  border-radius: @radius-card !important;
  margin-bottom: @space-4;

  // Semi Card header
  .semi-card-header {
    border-bottom: 1px solid @color-border !important;
    padding: 16px 20px !important;
  }

  .semi-card-header-wrapper {
    padding: 0 !important;
  }

  .semi-card-meta-title {
    font-weight: 700 !important;
    color: @color-text !important;
    font-size: @text-base !important;
  }

  .semi-card-meta-description {
    color: #b8b8b8 !important;
    font-size: @text-sm !important;
    margin-top: 2px;
  }

  .semi-card-body {
    padding: 16px 20px !important;
  }

  // Semi input focus accent
  .semi-input-wrapper:focus-within,
  .semi-select:focus-within {
    border-color: rgba(224,74,56,0.6) !important;
    box-shadow: none !important;
  }

  // Inputs inside segment cards
  .semi-input,
  .semi-input-number-wrapper {
    background: rgba(255,255,255,0.06) !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    border-radius: @radius-input !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/segment/SegmentParts.less
git commit -m "feat: section card (SegmentPart) new dark glass style"
```

---

## Task 9: Create/Edit Job (JobMutation)

**Files:**
- Modify: `ui/src/views/jobs/mutation/JobMutation.jsx` (add PageHeading + back button)
- Modify: `ui/src/views/jobs/mutation/JobMutation.less`

- [ ] **Step 1: Read the full `JobMutation.jsx`**

```bash
cat ui/src/views/jobs/mutation/JobMutation.jsx
```

- [ ] **Step 2: Add PageHeading + back button at the top of JobMutation.jsx**

Find the `return (` in `JobMutation.jsx`. Add `<Headline>` and a back button as the first elements after the outer div wrapper. The title should be "New Job" or "Edit Job" based on whether `params.jobId` exists.

At the top of the return statement (inside the Fragment or outer div), add:

```jsx
import Headline from '../../../components/headline/Headline.jsx';
import { IconArrowLeft } from '@douyinfe/semi-icons';
```

And at the top of the JSX return, before the first `<SegmentPart>`:

```jsx
<Headline
  text={params.jobId ? 'Edit Job' : 'New Job'}
  actions={
    <Button
      icon={<IconArrowLeft />}
      onClick={() => navigate('/jobs')}
      theme="borderless"
      style={{ color: '#909090' }}
    >
      Back
    </Button>
  }
/>
```

- [ ] **Step 3: Update `ui/src/views/jobs/mutation/JobMutation.less`**

```less
@import '../../../tokens.less';

.jobMutation {
  &__newButton {
    float: right;
    margin-bottom: @space-4;
  }

  &__specFilter {
    display: flex;
    gap: @space-4;
    flex-wrap: wrap;
  }

  &__specFilterItem {
    display: flex;
    flex-direction: column;
    gap: @space-2;
    flex: 1;
    min-width: 150px;
  }

  &__specFilterLabel {
    font-weight: 500;
    font-size: @text-sm;
    color: @color-muted;
  }

  &__actions {
    display: flex;
    gap: @space-3;
    margin-top: @space-4;
    justify-content: flex-end;
  }
}

.semi-select-option-list-wrapper {
  width: 25rem;
}
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/views/jobs/mutation/JobMutation.jsx ui/src/views/jobs/mutation/JobMutation.less
git commit -m "feat: job mutation view with page heading and back button"
```

---

## Task 10: Listings Grid

**Files:**
- Modify: `ui/src/components/grid/listings/ListingsGrid.jsx`
- Modify: `ui/src/components/grid/listings/ListingsGrid.less`
- Modify: `ui/src/views/listings/Listings.jsx`

Card grid with image (160px), star bookmark, price in green, action bar with 3 icon buttons. INACTIVE watermark overlay on inactive listing images.

- [ ] **Step 1: Update `ui/src/views/listings/Listings.jsx`** — add PageHeading

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import ListingsGrid from '../../components/grid/listings/ListingsGrid.jsx';
import Headline from '../../components/headline/Headline.jsx';

export default function Listings() {
  return (
    <>
      <Headline text="Listings" />
      <ListingsGrid />
    </>
  );
}
```

- [ ] **Step 2: Replace `ui/src/components/grid/listings/ListingsGrid.less`**

```less
@import '../../../tokens.less';

.listingsGrid {
  &__topbar {
    display: flex;
    align-items: center;
    gap: @space-3;
    margin-bottom: @space-4;
    flex-wrap: wrap;

    &__search {
      min-width: 200px;
      flex: 1;
    }

    &__filters {
      display: flex;
      align-items: center;
      gap: @space-2;
      flex-wrap: wrap;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }

  &__card {
    background: @color-elevated !important;
    border: 1px solid @color-border !important;
    border-radius: @radius-card !important;
    overflow: hidden;
    transition: transform @transition-card, box-shadow @transition-card;
    display: flex;
    flex-direction: column;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px -4px rgba(0,0,0,0.6);
    }

    &__image-wrapper {
      position: relative;
      height: 160px;
      overflow: hidden;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    }

    &__inactive-watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.35);

      span {
        font-size: 18px;
        font-weight: 800;
        color: rgba(251,113,133,0.9);
        text-transform: uppercase;
        letter-spacing: 0.15em;
        transform: rotate(-30deg);
        border: 2px solid rgba(251,113,133,0.5);
        padding: 4px 12px;
        border-radius: @radius-chip;
        backdrop-filter: blur(2px);
      }
    }

    &__star {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0,0,0,0.5);
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background @transition-fast;
      padding: 0;

      &:hover {
        background: rgba(0,0,0,0.75);
      }

      svg {
        color: @color-warning;
        font-size: 14px;
      }
    }

    &__body {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    &__title {
      font-weight: 700;
      font-size: @text-sm;
      color: @color-text;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__price {
      font-size: @text-base;
      font-weight: 600;
      color: @color-success;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    &__meta {
      font-size: @text-xs;
      color: @color-muted;
      display: flex;
      align-items: center;
      gap: 4px;

      .semi-icon {
        font-size: 11px;
        color: @color-faint;
      }
    }

    &__provider {
      font-size: @text-xs;
      color: @color-faint;
    }

    &__actions {
      display: flex;
      justify-content: space-around;
      padding: 8px 12px;
      border-top: 1px solid @color-border;
      gap: 4px;
      margin-top: auto;

      button {
        flex: 1;
        border: none !important;
        border-radius: @radius-chip !important;
      }
    }
  }

  &__pagination {
    margin-top: @space-4;
    display: flex;
    justify-content: center;
  }
}
```

- [ ] **Step 3: Rewrite the card rendering inside `ListingsGrid.jsx`**

In `ListingsGrid.jsx`, find the JSX where individual listing cards are rendered (the `<Card>` elements inside the `.map()`). Replace the entire card render block with this new structure. Keep all event handlers and state as-is — only the JSX structure changes.

Find the `<Row gutter={[12, 12]}>` (or similar) and its contents. Replace:

```jsx
// OLD pattern: Row/Col + Card with Semi Image inside
// NEW pattern: plain div grid + custom card structure
```

Replace the entire results section (from the `Row` wrapper to its closing tag) with:

```jsx
<div className="listingsGrid__grid">
  {(listingsData?.result || []).map((listing) => (
    <div key={listing.id} className="listingsGrid__card">
      <div className="listingsGrid__card__image-wrapper">
        <img
          src={listing.imageUrl || no_image}
          alt={listing.title}
          onError={(e) => { e.target.src = no_image; }}
        />
        {!listing.active && (
          <div className="listingsGrid__card__inactive-watermark">
            <span>Inactive</span>
          </div>
        )}
        <button
          className="listingsGrid__card__star"
          onClick={() => toggleWatchlist(listing.id, listing.onWatchlist)}
          aria-label={listing.onWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {listing.onWatchlist ? <IconStar /> : <IconStarStroked />}
        </button>
      </div>

      <div className="listingsGrid__card__body">
        <div className="listingsGrid__card__title" title={listing.title}>{listing.title}</div>
        {listing.price && (
          <div className="listingsGrid__card__price">
            <IconCart size="small" />
            {listing.price}
          </div>
        )}
        {listing.address && (
          <div className="listingsGrid__card__meta">
            <IconMapPin />
            {listing.address}
          </div>
        )}
        <div className="listingsGrid__card__meta">
          <IconBriefcase />
          {listing.provider}
          {listing.size && <span style={{ marginLeft: 4 }}>{listing.size} m²</span>}
        </div>
        <div className="listingsGrid__card__provider">
          <IconClock size="extra-small" style={{ marginRight: 3 }} />
          {timeService.format(listing.firstSeen)}
        </div>
      </div>

      <div className="listingsGrid__card__actions">
        <Tooltip content="Original Listing">
          <Button
            size="small"
            icon={<IconLink />}
            style={{ color: '#60a5fa' }}
            theme="borderless"
            onClick={() => window.open(listing.url, '_blank')}
          />
        </Tooltip>
        <Tooltip content="View in Fredy">
          <Button
            size="small"
            icon={<IconEyeOpened />}
            style={{ color: '#34d399' }}
            theme="borderless"
            onClick={() => navigate(`/listings/listing/${listing.id}`)}
          />
        </Tooltip>
        <Tooltip content="Remove">
          <Button
            size="small"
            icon={<IconDelete />}
            style={{ color: '#fb7185' }}
            theme="borderless"
            onClick={() => {
              setListingToDelete(listing.id);
              setDeleteModalVisible(true);
            }}
          />
        </Tooltip>
      </div>
    </div>
  ))}
</div>
```

Add `Tooltip` to the Semi UI imports: `import { ..., Tooltip } from '@douyinfe/semi-ui-19';`

Add a `toggleWatchlist` handler above the return statement if not already present:

```jsx
const toggleWatchlist = async (listingId, currentStatus) => {
  try {
    await xhrPost(`/api/listings/${listingId}/watchlist`, { onWatchlist: !currentStatus });
    loadData();
  } catch {
    Toast.error('Failed to update watchlist');
  }
};
```

Keep the topbar, pagination, and `ListingDeletionModal` exactly as they are.

- [ ] **Step 4: Remove `Col` and `Row` from ListingsGrid imports** (they are no longer used if you replaced the Row/Col grid)

- [ ] **Step 5: Commit**

```bash
git add ui/src/views/listings/Listings.jsx ui/src/components/grid/listings/ListingsGrid.jsx ui/src/components/grid/listings/ListingsGrid.less
git commit -m "feat: new listing card grid with image, star, action bar"
```

---

## Task 11: Map View

**Files:**
- Modify: `ui/src/views/listings/Map.jsx`
- Modify: `ui/src/views/listings/Map.less`

Add PageHeading. Style the floating filter panel to match the spec.

- [ ] **Step 1: Add `Headline` import and render it at the top of `MapView` in `Map.jsx`**

In `Map.jsx`, add:
```jsx
import Headline from '../../components/headline/Headline.jsx';
```

Inside the return statement, before the map container div, add:
```jsx
<Headline text="Map View" />
```

- [ ] **Step 2: Update the floating panel styles in `Map.less`**

Find the `&__floating-panel` rule and update to match spec:

```less
&__floating-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  background: rgba(22, 25, 38, 0.95);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid @color-border;
  border-radius: @radius-card;
  padding: 14px 16px;
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
```

Add `@import '../../tokens.less';` at the top of Map.less if not present.

- [ ] **Step 3: Commit**

```bash
git add ui/src/views/listings/Map.jsx ui/src/views/listings/Map.less
git commit -m "feat: map view with page heading and styled filter panel"
```

---

## Task 12: Users View + UserTable

**Files:**
- Modify: `ui/src/views/user/Users.jsx`
- Modify: `ui/src/views/user/Users.less`
- Modify: `ui/src/components/table/UserTable.jsx`

PageHeading with "+ New User" button. Avatar initials circle. Admin badge in red accent.

- [ ] **Step 1: Replace `ui/src/views/user/Users.jsx`**

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Toast, Button } from '@douyinfe/semi-ui-19';
import { IconPlus } from '@douyinfe/semi-icons';
import UserTable from '../../components/table/UserTable';
import { useActions, useSelector } from '../../services/state/store';
import UserRemovalModal from './UserRemovalModal';
import { xhrDelete } from '../../services/xhr';
import { useNavigate } from 'react-router-dom';
import Headline from '../../components/headline/Headline.jsx';
import './Users.less';

const Users = function Users() {
  const actions = useActions();
  const [loading, setLoading] = React.useState(true);
  const users = useSelector((state) => state.user.users);
  const [userIdToBeRemoved, setUserIdToBeRemoved] = React.useState(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    async function init() {
      await actions.user.getUsers();
      setLoading(false);
    }
    init();
  }, []);

  const onUserRemoval = async () => {
    try {
      await xhrDelete('/api/admin/users', { userId: userIdToBeRemoved });
      Toast.success('User successfully removed');
      setUserIdToBeRemoved(null);
      await actions.jobsData.getJobs();
      await actions.user.getUsers();
    } catch (error) {
      Toast.error(error);
      setUserIdToBeRemoved(null);
    }
  };

  return (
    <div className="users">
      <Headline
        text="Users"
        actions={
          <Button type="primary" theme="solid" icon={<IconPlus />} onClick={() => navigate('/users/new')}>
            New User
          </Button>
        }
      />
      {!loading && (
        <React.Fragment>
          {userIdToBeRemoved && (
            <UserRemovalModal onCancel={() => setUserIdToBeRemoved(null)} onOk={onUserRemoval} />
          )}
          <UserTable
            user={users}
            onUserEdit={(userId) => navigate(`/users/edit/${userId}`)}
            onUserRemoval={(userId) => setUserIdToBeRemoved(userId)}
          />
        </React.Fragment>
      )}
    </div>
  );
};

export default Users;
```

- [ ] **Step 2: Replace `ui/src/views/user/Users.less`**

```less
@import '../../tokens.less';

.users {
  display: flex;
  flex-direction: column;
  flex: 1;
}
```

- [ ] **Step 3: Update `ui/src/components/table/UserTable.jsx`** — add avatar initials + admin badge

```jsx
/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { IllustrationNoResult, IllustrationNoResultDark } from '@douyinfe/semi-illustrations';
import { format } from '../../services/time/timeService';
import { Table, Button, Empty, Tag, Avatar } from '@douyinfe/semi-ui-19';
import { IconDelete, IconEdit } from '@douyinfe/semi-icons';

const empty = (
  <Empty
    image={<IllustrationNoResult />}
    darkModeImage={<IllustrationNoResultDark />}
    description="No users found."
  />
);

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function UserTable({ user = [], onUserRemoval, onUserEdit } = {}) {
  return (
    <Table
      pagination={false}
      empty={empty}
      columns={[
        {
          title: 'User',
          dataIndex: 'username',
          render: (value, record) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                size="small"
                style={{
                  background: record.isAdmin ? 'rgba(224,74,56,0.15)' : 'rgba(148,163,184,0.12)',
                  border: `1px solid ${record.isAdmin ? 'rgba(224,74,56,0.4)' : 'rgba(148,163,184,0.2)'}`,
                  color: record.isAdmin ? '#e04a38' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {getInitials(value)}
              </Avatar>
              <span style={{ color: '#efefef', fontWeight: 500 }}>{value}</span>
              {record.isAdmin && (
                <Tag
                  size="small"
                  style={{
                    background: 'rgba(224,74,56,0.12)',
                    border: '1px solid rgba(224,74,56,0.35)',
                    color: '#e04a38',
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    padding: '0 8px',
                  }}
                >
                  ADMIN
                </Tag>
              )}
            </div>
          ),
        },
        {
          title: 'Last login',
          dataIndex: 'lastLogin',
          render: (value) => format(value),
        },
        {
          title: 'Jobs',
          dataIndex: 'numberOfJobs',
        },
        {
          title: 'MCP Token',
          dataIndex: 'mcpToken',
          render: (value) => (
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85em', wordBreak: 'break-all', color: '#505050' }}>
              {value || '---'}
            </span>
          ),
        },
        {
          title: '',
          dataIndex: 'tools',
          render: (_, record) => (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(251,113,133,0.2)',
                  color: '#fb7185',
                }}
                icon={<IconDelete />}
                onClick={() => onUserRemoval(record.id)}
              />
              <Button type="primary" theme="solid" icon={<IconEdit />} onClick={() => onUserEdit(record.id)} />
            </div>
          ),
        },
      ]}
      dataSource={user}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/views/user/Users.jsx ui/src/views/user/Users.less ui/src/components/table/UserTable.jsx
git commit -m "feat: users view with page heading, avatar initials, admin badge"
```

---

## Task 13: User Mutation (Create/Edit User)

**Files:**
- Modify: `ui/src/views/user/mutation/UserMutator.jsx`
- Modify: `ui/src/views/user/mutation/UserMutator.less`

- [ ] **Step 1: Read full `UserMutator.jsx`**

```bash
cat ui/src/views/user/mutation/UserMutator.jsx
```

- [ ] **Step 2: Add PageHeading + back button at the top of UserMutator.jsx**

Add these imports if not present:
```jsx
import Headline from '../../../components/headline/Headline.jsx';
import { IconArrowLeft } from '@douyinfe/semi-icons';
```

Inside the return (after the outer `<div>` or `<Fragment>`), add as the very first element:

```jsx
<Headline
  text={params.userId ? 'Edit User' : 'New User'}
  actions={
    <Button
      icon={<IconArrowLeft />}
      onClick={() => navigate('/users')}
      theme="borderless"
      style={{ color: '#909090' }}
    >
      Back
    </Button>
  }
/>
```

- [ ] **Step 3: Replace `UserMutator.less`**

```less
@import '../../../tokens.less';

.userMutator {
  display: flex;
  flex-direction: column;

  &__actions {
    display: flex;
    gap: @space-3;
    margin-top: @space-2;
    justify-content: flex-end;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/views/user/mutation/UserMutator.jsx ui/src/views/user/mutation/UserMutator.less
git commit -m "feat: user mutation with page heading and back button"
```

---

## Task 14: Settings View (GeneralSettings)

**Files:**
- Modify: `ui/src/views/generalSettings/GeneralSettings.jsx`
- Modify: `ui/src/views/generalSettings/GeneralSettings.less`

Add PageHeading. Style the tabs with red active indicator. The SegmentPart cards are already styled via Task 8.

- [ ] **Step 1: Add `Headline` import to `GeneralSettings.jsx`**

```jsx
import Headline from '../../components/headline/Headline.jsx';
```

At the start of the return (before the `{!loading && ...}` check), add:

```jsx
<>
  <Headline text="Settings" />
  {!loading && (
    // ... existing content
  )}
</>
```

Wrap the whole return in a Fragment if needed.

- [ ] **Step 2: Replace `ui/src/views/generalSettings/GeneralSettings.less`**

```less
@import '../../tokens.less';

.generalSettings {
  display: flex;
  flex-direction: column;
  flex: 1;

  &__tab-content {
    padding: @space-4 0;
  }

  &__timePickerContainer {
    display: flex;
    gap: @space-3;
    flex-wrap: wrap;
    align-items: center;
  }

  &__save-row {
    display: flex;
    justify-content: flex-end;
    margin-top: @space-2;
  }
}

// Tabs styling
.semi-tabs-bar-line .semi-tabs-tab {
  color: @color-faint;
  font-size: @text-base;
  transition: color @transition-fast;

  &:hover {
    color: @color-muted;
  }

  &.semi-tabs-tab-active {
    color: @color-text !important;
  }
}

.semi-tabs-bar-line .semi-tabs-ink-bar {
  background-color: @color-accent !important;
  height: 2px;
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/views/generalSettings/GeneralSettings.jsx ui/src/views/generalSettings/GeneralSettings.less
git commit -m "feat: settings view with page heading and accent tab indicator"
```

---

## Task 15: Listing Detail

**Files:**
- Modify: `ui/src/views/listings/ListingDetail.jsx`
- Modify: `ui/src/views/listings/ListingDetail.less`

`WatchlistManagement.jsx` already imports and uses `Headline` — no changes needed there. `ListingDetail.jsx` already has a back button (`IconArrowLeft` + navigate('/listings')). It needs a `Headline` component at the top and a `tokens.less` import in its LESS file.

- [ ] **Step 1: Add Headline to ListingDetail.jsx**

Add this import at the top:
```jsx
import Headline from '../../components/headline/Headline.jsx';
```

Inside the return, find the existing back button (Button with `IconArrowLeft`). Replace the back-button + title row with a `Headline` that has the back button in the `actions` slot:

```jsx
<Headline
  text={listing?.title || 'Listing Detail'}
  actions={
    <Button
      icon={<IconArrowLeft />}
      onClick={() => navigate('/listings')}
      theme="borderless"
      style={{ color: '#909090' }}
    >
      Back
    </Button>
  }
/>
```

Remove the old separate back-button and title elements from the JSX.

- [ ] **Step 2: Add tokens import to `ListingDetail.less`**

At the top of `ui/src/views/listings/ListingDetail.less`, add:
```less
@import '../../tokens.less';
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/views/listings/ListingDetail.jsx ui/src/views/listings/ListingDetail.less
git commit -m "feat: listing detail view with page heading"
```

---

## Task 16: Final Polish + Verification

**Files:**
- Review all views in browser

- [ ] **Step 1: Start dev server**

```bash
yarn dev
```

- [ ] **Step 2: Visual checklist — verify each screen**

Open each route and check:
- [ ] `/login` — glass card, Outfit font, red login button, correct card dimensions
- [ ] `/dashboard` — PageHeading with gradient line, 4+4 KPI cards at 112px, no hover lift on KPI cards
- [ ] `/jobs` — PageHeading with "New Job" button, cards with dark bg
- [ ] `/jobs/new` — PageHeading "New Job", back button, section cards with correct dark style
- [ ] `/jobs/edit/:id` — PageHeading "Edit Job", back button, same layout
- [ ] `/listings` — PageHeading, card grid with image, star, price, action bar (blue/green/red icons)
- [ ] `/map` — PageHeading "Map View", filter panel overlay at top-right
- [ ] `/users` — PageHeading "Users", "+ New User" button, avatar initials, admin badge
- [ ] `/users/new` — PageHeading "New User", back button
- [ ] `/generalSettings` — PageHeading "Settings", tabs with red underline on active
- [ ] Sidebar collapses at width <= 850px
- [ ] Footer shows "Fredy vX.X.X" left, "Made with ❤️ by Christian Kellner" link right
- [ ] Scrollbar is thin (6px) and dark

- [ ] **Step 3: Mobile check (resize to 375px)**

- [ ] Sidebar is collapsed and shows heart icon
- [ ] Content padding is 12px
- [ ] Listing cards are single-column
- [ ] Login card fits viewport with no overflow

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Fredy UI redesign — complete cronpilot CI implementation"
```

---

## Appendix: Design Token Quick Reference

| Token | Value | Usage |
|---|---|---|
| `@color-base` | `#0d0d0d` | Body background |
| `@color-surface` | `#161616` | Cards, sidebar |
| `@color-elevated` | `#1e1e1e` | Listing cards, modals |
| `@color-border` | `#2a2a2a` | All borders |
| `@color-accent` | `#e04a38` | Buttons, active states |
| `@color-text` | `#efefef` | Primary text |
| `@color-muted` | `#909090` | Secondary text |
| `@color-faint` | `#505050` | Disabled, labels |
| `@font-ui` | Outfit | All UI text |
| `@font-mono` | JetBrains Mono | Code, tokens |
