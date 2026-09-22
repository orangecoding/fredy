/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const hook = read('ui/src/views/admin/useAdminSettings.js');
const field = read('ui/src/views/admin/components/AdminField.jsx');
const fieldLess = read('ui/src/views/admin/components/AdminField.less');
const shellLess = read('ui/src/components/settingsShell/SettingsShell.less');
const saveBar = read('ui/src/components/settingsShell/SettingsSaveBar.jsx');
const users = read('ui/src/views/user/Users.jsx');
const userTable = read('ui/src/components/table/UserTable.jsx');
const userTableLess = read('ui/src/components/table/UserTable.less');

const PAGES = {
  system: read('ui/src/views/admin/pages/SystemPage.jsx'),
  execution: read('ui/src/views/admin/pages/ExecutionPage.jsx'),
  routing: read('ui/src/views/admin/pages/RoutingPage.jsx'),
  connectivity: read('ui/src/views/admin/pages/ConnectivityPage.jsx'),
  backup: read('ui/src/views/admin/pages/BackupPage.jsx'),
  debug: read('ui/src/views/admin/pages/DebugPage.jsx'),
};

const FORM_PAGES = ['system', 'execution', 'routing', 'connectivity'];

describe('the one real bug', () => {
  it('declares no component inside a render body', () => {
    // `const Dial = (...) => (...)` inside RoutingPage made a new component type on every render,
    // so React threw the input away and rebuilt it - the field lost focus after every keystroke.
    // Six of the page's seven numbers were affected.
    for (const [name, text] of Object.entries(PAGES)) {
      const body = text.slice(text.indexOf('export default function'));
      expect([...body.matchAll(/^\s{2}const [A-Z]\w* = \(/gm)], name).toHaveLength(0);
    }
  });

  it('uses one shared field component defined at module scope', () => {
    expect(field).toMatch(/^export default function AdminField/m);
    expect(PAGES.routing).toMatch(/<AdminField/);
    expect(PAGES.routing).toMatch(/const DIALS = Object\.freeze/);
    expect(PAGES.routing).not.toMatch(/const Dial/);
  });
});

describe('saving', () => {
  it('gives every page a way back', () => {
    for (const name of ['System', 'Execution', 'Connectivity', 'Routing']) {
      expect(hook, name).toMatch(new RegExp(`discard${name}:`));
    }
  });

  it('uses the sticky bar on all four form pages', () => {
    for (const name of FORM_PAGES) {
      expect(PAGES[name], name).toMatch(/<SettingsSaveBar/);
      expect(PAGES[name], name).toMatch(/onDiscard=/);
      expect(PAGES[name], name).toMatch(/useUnsavedWarning\(/);
    }
  });

  it('retires the save row for good, including its last misuse as a button row', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      expect(text, name).not.toMatch(/settingsShell__saveRow/);
    }
    expect(users).not.toMatch(/settingsShell__saveRow/);
    expect(shellLess).not.toMatch(/__saveRow/);
  });

  it('warns before the one save that reloads the browser', () => {
    expect(saveBar).toMatch(/note/);
    expect(PAGES.system).toMatch(/saveRestartNote/);
  });
});

describe('help that is read once stops being read every time', () => {
  it('puts the long explanations behind a mark', () => {
    expect([...PAGES.system.matchAll(/helpMode="popover"/g)].length).toBeGreaterThanOrEqual(4);
    expect(field).toMatch(/Popover/);
  });

  it('keeps warnings in front of the reader rather than behind a mark', () => {
    // A warning you have to open is not a warning.
    for (const name of ['system', 'execution']) {
      expect(PAGES[name], name).toMatch(/settingsShell__helpWarning/);
    }
  });

  it('has no standing Banner left outside the two places something just happened', () => {
    for (const name of FORM_PAGES) {
      expect([...PAGES[name].matchAll(/<Banner/g)].length, name).toBe(0);
    }
    // The restore dialog reports what the analysis just found.
    expect([...PAGES.backup.matchAll(/<Banner/g)].length).toBe(3);
  });
});

describe('the pages say what they are', () => {
  it('groups the system page instead of stacking ten cards', () => {
    expect([...PAGES.system.matchAll(/settingsShell__groupTitle/g)].length).toBeGreaterThanOrEqual(4);
    expect([...PAGES.system.matchAll(/<SegmentPart/g)].length).toBeLessThanOrEqual(6);
  });

  it('says in one sentence what the four execution dials mean together', () => {
    expect(PAGES.execution).toMatch(/executionPage__summary/);
    expect(PAGES.execution).toMatch(/summaryAllDay/);
    expect(PAGES.execution).toMatch(/summaryWindow/);
  });

  it('shows the next run on the page that sets the interval', () => {
    expect(PAGES.execution).toMatch(/nextRun/);
    expect(PAGES.execution).toMatch(/nav\.nextRun/);
  });

  it('shows how much of the routing budget is actually spent', () => {
    expect(PAGES.routing).toMatch(/travel-time-progress/);
  });

  it('drops the indent that expressed no dependency, and keeps the one that does', () => {
    /*
     * One block, not one occurrence of the name. The surviving block writes its own class name
     * twice - once as the block, once as `--disabled` in the same template literal - so counting
     * the bare name would count a single block as two and could only be satisfied by deleting the
     * block the plan says to keep. The negative lookahead counts blocks, which is what this is
     * about: the travel-time rail hung off no switch at all and is gone, the places rail hangs off
     * `poiEnabled` and stays.
     */
    expect([...PAGES.routing.matchAll(/settingsShell__subSettings(?!--)/g)]).toHaveLength(1);
    expect(PAGES.routing).toMatch(/poiEnabled \? '' : ' settingsShell__subSettings--disabled'/);
  });

  it('moves the connectivity switch into the header it governs', () => {
    expect(PAGES.connectivity).toMatch(/action=\{/);
    expect(PAGES.connectivity).not.toMatch(/settingsShell__subSettings/);
  });

  it('labels nothing it cannot label', () => {
    // <label> without htmlFor and without a control inside is worse than no label at all.
    expect(PAGES.connectivity).not.toMatch(/<label className="settingsShell__subSetting__label">/);
  });
});

describe('danger looks like danger', () => {
  it('gives restore its own card, its own border and its own mark', () => {
    expect(PAGES.backup).toMatch(/backupPage__danger/);
    expect(PAGES.backup).toMatch(/IconAlertTriangle/);
    expect(read('ui/src/views/admin/pages/BackupPage.less')).toMatch(/@color-error-rgb/);
  });

  it('says when a backup was last taken from this browser', () => {
    expect(PAGES.backup).toMatch(/lastBackupAt/);
    expect(PAGES.backup).toMatch(/try \{/);
  });

  it('leaves debug with exactly one filled button', () => {
    /*
     * On the card. The two confirmations keep theirs, which is why this stops at the first modal
     * rather than counting the whole file: a dialog asking whether to delete stored logs is
     * allowed - required, really - to fill the button that does it, and the plan leaves both
     * confirmations untouched. What was wrong was the card, where two filled buttons in warning
     * colours stood side by side with the harmless download between them.
     */
    const card = PAGES.debug.slice(0, PAGES.debug.indexOf('{debugConfirmVisible &&'));
    const filled = [...card.matchAll(/theme="solid"/g)];
    expect(filled).toHaveLength(1);
    expect(PAGES.debug).toMatch(/Dropdown/);
  });

  it('gives the user table the same hierarchy as every other table here', () => {
    expect(userTable).not.toMatch(/type="primary"/);
    expect(userTable).toMatch(/Dropdown/);
    expect(userTable).toMatch(/type="danger"/);
    expect(userTable).toMatch(/tableColumnActions/);
  });

  it('keeps the revealed token from growing the row or the column', () => {
    /*
     * The same bug twice, one level apart. As a column, 70 characters with `word-break: break-all`
     * made the row three times as tall; moved to a line under the name it kept the break and made
     * it six. A token is copied, not read, so it stays on one line and is cut off where the space
     * ends - the copy button takes the value from state, not from the DOM, so nothing is lost.
     *
     * The second half is the other direction of the same mistake: `nowrap` alone has the whole
     * string as its min-content, and the table answered by pulling the user column to 526px and
     * pushing the other three out of sight. `width: 0` with `min-width: 100%` fills the column
     * without contributing to its minimum.
     */
    // Als Deklaration, nicht als Wort: der Kommentar daneben nennt `word-break` als das, was
    // hier zweimal schiefging, und darf deshalb nicht selbst den Test ausloesen.
    expect(userTableLess).not.toMatch(/^\s*word-break\s*:/m);
    expect(userTableLess).toMatch(/white-space:\s*nowrap/);
    expect(userTableLess).toMatch(/text-overflow:\s*ellipsis/);
    expect(userTableLess).toMatch(/width:\s*0;[\s\S]{0,200}?min-width:\s*100%/);
  });
});

describe('no styling in the markup', () => {
  it('spends no colour and no spacing there', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      expect([...text.matchAll(/style=\{\{/g)].length, name).toBe(0);
    }
    expect([...userTable.matchAll(/style=\{\{/g)]).toHaveLength(0);
  });

  it('keeps Semi’s own colours out of the administration', () => {
    for (const [name, text] of Object.entries(PAGES)) {
      expect(text, name).not.toMatch(/--semi-color/);
    }
    expect(userTable).not.toMatch(/var\(--f-/);
  });
});

describe('spacing comes from the scale', () => {
  const SPACING =
    /^\s*(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left):\s*([^;]+);/gm;

  /**
   * Every spacing declaration in the stylesheets this plan adds whose value is not on the scale.
   *
   * @param {string} text
   * @returns {string[]}
   */
  function offenders(text) {
    const bad = [];
    for (const match of text.replace(/\s*!important/g, '').matchAll(SPACING)) {
      for (const part of match[2].trim().split(/\s+/)) {
        if (!/^(0|auto|-?@space-\d+)$/.test(part)) bad.push(match[0].trim());
      }
    }
    return bad;
  }

  it('holds for the four stylesheets this plan adds', () => {
    expect(offenders(fieldLess)).toEqual([]);
    expect(offenders(userTableLess)).toEqual([]);
    expect(offenders(read('ui/src/views/admin/pages/BackupPage.less'))).toEqual([]);
    expect(offenders(read('ui/src/views/admin/pages/DebugPage.less'))).toEqual([]);
    expect(offenders(read('ui/src/views/admin/pages/ExecutionPage.less'))).toEqual([]);
  });
});
