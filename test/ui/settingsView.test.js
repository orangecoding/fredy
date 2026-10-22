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

const shellLess = read('ui/src/components/settingsShell/SettingsShell.less');
const shellJsx = read('ui/src/components/settingsShell/SettingsShell.jsx');
const saveBar = read('ui/src/components/settingsShell/SettingsSaveBar.jsx');
const saveBarLess = read('ui/src/components/settingsShell/SettingsSaveBar.less');
const emptyLess = read('ui/src/components/settingsShell/SettingsEmptyState.less');
const badgeLess = read('ui/src/components/scopeBadge/ScopeBadge.less');
const headline = read('ui/src/components/headline/Headline.jsx');
const segment = read('ui/src/components/segment/SegmentPart.jsx');
const settingsLayout = read('ui/src/views/settings/SettingsLayout.jsx');
const adminLayout = read('ui/src/views/admin/AdminLayout.jsx');
const navJsx = read('ui/src/components/navigation/Navigation.jsx');
const warning = read('ui/src/hooks/useUnsavedWarning.js');
const themes = read('ui/src/themes.less');
const indexLess = read('ui/src/Index.less');
const preferencesLess = read('ui/src/views/settings/pages/PreferencesPage.less');

const preferences = read('ui/src/views/settings/pages/PreferencesPage.jsx');
const travelTime = read('ui/src/views/settings/pages/TravelTimePage.jsx');
const entry = read('ui/src/views/settings/pages/components/TravelTimeEntry.jsx');
const listingDetails = read('ui/src/views/settings/pages/ListingDetailsPage.jsx');
const application = read('ui/src/views/settings/pages/ApplicationPage.jsx');
const applicationLess = read('ui/src/views/settings/pages/ApplicationPage.less');
const notifications = read('ui/src/views/settings/pages/NotificationsPage.jsx');
const connections = read('ui/src/views/settings/pages/ConnectionsPage.jsx');

const FORM_PAGES = [
  ['preferences', preferences],
  ['travelTime', travelTime],
  ['listingDetails', listingDetails],
  ['application', application],
];

describe('both areas say whose settings they are', () => {
  it('carries a scope badge on each of them', () => {
    expect(settingsLayout).toMatch(/<ScopeBadge scope="user"/);
    expect(adminLayout).toMatch(/<ScopeBadge scope="instance"/);
  });

  it('puts it beside the title rather than in the actions slot', () => {
    expect(headline).toMatch(/page-heading__titleRow/);
    expect(headline).toMatch(/\{badge\}/);
    expect(shellJsx).toMatch(/badge=\{badge\}/);
  });

  it('spends no accent on it: it states where you are, it is not a button', () => {
    expect(badgeLess).not.toMatch(/@color-accent/);
  });

  it('is said by the two pages only, not again on hover in the sidebar', () => {
    // The sidebar repeated it as a popover over Settings and Administration, which got in the way
    // of every visit for an answer the page heading already gives.
    expect(navJsx).not.toMatch(/ScopeBadge/);
    expect(navJsx).not.toMatch(/Popover/);
  });
});

/*
 * The tab strip is styled once, globally, in Index.less: every strip in the app is the same strip,
 * so the shell no longer restates it. Exposé spec: muted labels, the current one in the text colour
 * over a text-coloured ink bar. The old spec put the bar in the accent and the label at 600.
 */
describe('the tabs are readable without a mouse', () => {
  it('no longer prints five of six at 2,47 to 1', () => {
    const block = indexLess.match(/\.semi-tabs-bar-line \.semi-tabs-tab \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/@color-faint/);
    expect(block[0]).toMatch(/color:\s*@color-muted;/);
  });

  it('carries the selection on the text colour and the ink bar, never on the accent', () => {
    expect(indexLess).toMatch(/semi-tabs-tab-active \{\s*color:\s*@color-text/);
    expect(indexLess).toMatch(/semi-tabs-ink-bar \{[\s\S]{0,80}@color-text/);
    expect(shellLess).not.toMatch(/semi-tabs-ink-bar|semi-tabs-tab-active/);
  });
});

describe('saving', () => {
  it('shows nothing rather than a dead button', () => {
    expect(saveBar).toMatch(/if \(!dirty\) \{\s*return null;/);
    // The plan retires `settingsShell__saveRow` on the assumption that nothing uses it any more.
    // Four admin pages and the user list still do, and those are out of this plan's scope, so the
    // rule stays and what is asserted is the thing the plan was actually after: no page under
    // Einstellungen ends in a save row of its own. The per-page loop below is the other half.
    for (const [name, text] of FORM_PAGES) {
      expect(text, name).not.toMatch(/settingsShell__saveRow/);
    }
  });

  it('sticks to the bottom instead of sitting at the end of the page', () => {
    expect(saveBarLess).toMatch(/position: sticky/);
    expect(saveBarLess).toMatch(/bottom: @space-4/);
  });

  // Exposé: a surface with a hairline, like every other box. The old bar carried @shadow-lg.
  it('floats flat, without a heavy shadow', () => {
    expect(saveBarLess).not.toMatch(/box-shadow/);
    expect(saveBarLess).toMatch(/background: @color-surface/);
    expect(saveBarLess).toMatch(/border: 1px solid @color-border/);
  });

  it('is used by all four form pages, and none of them keeps its own save row', () => {
    for (const [name, text] of FORM_PAGES) {
      expect(text, name).toMatch(/<SettingsSaveBar/);
      expect(text, name).not.toMatch(/settingsShell__saveRow/);
      expect(text, name).toMatch(/onDiscard=/);
      expect(text, name).toMatch(/useUnsavedWarning\(/);
    }
  });

  it('gives the travel time page the dirty check it never had', () => {
    expect(travelTime).toMatch(/const dirty = useMemo/);
    // Against the same normalisation the rows are built from, or a freshly loaded page reports a
    // change it never had.
    expect(travelTime).toMatch(/\.map\(toRow\)\)/);
  });

  it('says out loud why an in-app tab switch is not blocked', () => {
    expect(warning).toMatch(/beforeunload/);
    expect(warning).toMatch(/HashRouter/);
    expect(warning).not.toMatch(/useBlocker\(/);
  });

  it('marks the one card that does not wait for the bar', () => {
    expect(preferences).toMatch(/settingsShell__instant/);
    expect(shellLess).toMatch(/\.settingsShell__instant\b/);
  });
});

describe('preferences', () => {
  it('shows the theme instead of only naming it', () => {
    expect(preferences).toMatch(/preferencesPage__swatch/);
    expect(preferences).toMatch(/role="radiogroup"/);
    expect(preferences).toMatch(/aria-checked=/);
  });

  it('defines the preview colours in both theme blocks, identically', () => {
    for (const token of ['--f-preview-dark-bg', '--f-preview-light-bg']) {
      expect([...themes.matchAll(new RegExp(token, 'g')), token]).toHaveLength(3);
    }
  });

  // Exposé: selected is the text colour - a 1px edge on the elevated step - never the accent, which
  // is kept for the one action a page is about. The old tiles and cards were red.
  it('marks the chosen theme and deletion mode in the text colour, not in red', () => {
    expect(preferencesLess).not.toMatch(/@color-accent/);
    expect(preferencesLess).toMatch(/&--on,[\s\S]{0,40}\{\s*border-color: @color-text;/);
    expect(preferencesLess).toMatch(/&\.semi-radio-checked \{\s*border-color: @color-text;/);
  });

  it('keeps the radio card text left-aligned', () => {
    expect(preferencesLess).toMatch(/\.semi-radio-addon \{[\s\S]*?text-align: left;/);
  });

  it('stops nesting the deletion consequence three levels deep', () => {
    expect(preferences).toMatch(/const DELETION_MODES/);
    expect(preferences).not.toMatch(/<br \/>/);
    expect(preferences).not.toMatch(/<Text type="warning">/);
  });
});

describe('travel time', () => {
  it('prints the repeated help paragraph once, in the card', () => {
    expect(entry).not.toMatch(/addressDepartureHelp|addressStreetModeHelp/);
    expect(travelTime).toMatch(/addressDepartureHelp/);
  });

  it('summarises an address the way it already summarised a place type', () => {
    expect(entry).toMatch(/settings\.addressSummary/);
    expect(entry).toMatch(/settings\.placeTypeSummary/);
  });

  it('opens the controls for a row that was just added, and only for that one', () => {
    expect(entry).toMatch(/useState\(startOpen\)/);
    expect(travelTime).toMatch(/setOpenKey\(row\.key\)/);
  });

  // The rows keep state of their own, so they are keyed by identity: keyed by position, removing a
  // row handed its open controls (and its address suggestions) to the row below.
  it('keys the rows by identity rather than by position', () => {
    expect(travelTime).toMatch(/key=\{row\.key\}/);
    expect(travelTime).not.toMatch(/key=\{idx\}/);
  });

  // Saving the unchanged list is how a failed geocode is retried, so the bar that holds Save has to
  // be there for it.
  it('offers Save while an address could not be located', () => {
    expect(travelTime).toMatch(/dirty=\{dirty \|\| geocodeFailed\}/);
  });

  it('takes the red trash icon out of every row', () => {
    expect(entry).toMatch(/Dropdown/);
    expect(travelTime).not.toMatch(/IconDelete/);
  });

  it('says what the page is for when it holds nothing', () => {
    expect(travelTime).toMatch(/rows\.length === 0/);
    expect(travelTime).toMatch(/travelTimeEmpty/);
  });
});

describe('listing details', () => {
  it('hangs the dependent setting off the one it depends on', () => {
    expect(listingDetails).toMatch(/settingsShell__subSettings/);
    expect(listingDetails).toMatch(/disabled=\{selected\.length === 0\}/);
  });

  it('says how many providers were picked, because that is what it costs', () => {
    expect(listingDetails).toMatch(/providerDetailsCount/);
  });
});

describe('application', () => {
  it('shows the letter next to what produces it', () => {
    expect(application).toMatch(/applicationPage__split/);
    expect(applicationLess).toMatch(/auto-fit, minmax\(min\(320px, 100%\), 1fr\)/);
    // The preview stopped being a card of its own at the very bottom.
    expect([...application.matchAll(/<SegmentPart/g)]).toHaveLength(5);
  });

  it('puts the placeholders behind a control instead of between the two', () => {
    expect(application).toMatch(/<Popover/);
    expect(application).toMatch(/insertPlaceholder/);
  });

  it('groups the six cards into the two things they are', () => {
    expect(application).toMatch(/application\.groupProfile/);
    expect(application).toMatch(/application\.groupLetter/);
  });

  it('asks for a date with a date picker', () => {
    expect(application).toMatch(/<DatePicker/);
    expect(application).not.toMatch(/placeholder="2026-12-01"/);
  });
});

describe('notifications and connections', () => {
  it('greets an account without channels with something other than an empty table', () => {
    expect(notifications).toMatch(/channels\.length === 0/);
    expect(notifications).toMatch(/<SettingsEmptyState/);
  });

  it('puts the add action in the card header', () => {
    expect(segment).toMatch(/headerExtraContent=\{action\}/);
    expect(notifications).toMatch(/action=\{/);
  });

  it('leaves the shared channel table alone, because the job form owns it too', () => {
    expect(read('ui/src/components/table/NotificationChannelTable.jsx')).toMatch(/emptyText/);
  });

  it('spends no filled red block per row on revoking', () => {
    expect(connections).toMatch(/theme="borderless"/);
    expect(connections).toMatch(/columnAction/);
    expect(connections).not.toMatch(/color=\{writes \? 'amber'/);
  });
});

describe('status flags and badges are pills', () => {
  it('draws the section flags as a pill whose dot carries the state', () => {
    expect(shellLess).toMatch(/\.settingsShell__cardFlag \{[\s\S]*?border-radius: @radius-pill;/);
    expect(shellLess).toMatch(/&--live \{\s*background: @color-error;/);
  });

  it('draws the scope badge as a muted pill without a tinted icon', () => {
    expect(badgeLess).toMatch(/border-radius: @radius-pill/);
    expect(badgeLess).not.toMatch(/@color-(info|warning)/);
  });

  it('gives write access a tinted pill and read access a plain one', () => {
    const connectionsLess = read('ui/src/views/settings/pages/ConnectionsPage.less');
    expect(connectionsLess).toMatch(/border-radius: @radius-pill/);
    expect(connectionsLess).toMatch(/&--write \{\s*background: rgb\(@color-warning-rgb \/ 12%\);/);
  });
});

describe('no standing banner, no borrowed palette', () => {
  it('keeps a Banner only for something that really just happened', () => {
    for (const [name, text] of FORM_PAGES.concat([['notifications', notifications]])) {
      expect([...text.matchAll(/<Banner/g)].length, name).toBe(0);
    }
    // The geocoding failure: it did just happen, to one row.
    expect([...entry.matchAll(/<Banner/g)]).toHaveLength(1);
    expect(entry).toMatch(/homeAddressGeoError/);
  });

  it('takes Semi’s own colours out of the settings area', () => {
    for (const file of [
      'ui/src/components/settingsShell/SettingsShell.less',
      'ui/src/views/settings/pages/NotificationsPage.less',
      'ui/src/views/admin/AdminLayout.jsx',
      'ui/src/views/settings/pages/ConnectionsPage.jsx',
    ]) {
      expect(read(file), file).not.toMatch(/--semi-color|color="amber"|color="grey"/);
    }
  });

  it('keeps spacing out of the markup', () => {
    for (const [name, text] of FORM_PAGES.concat([
      ['notifications', notifications],
      ['admin', adminLayout],
      ['entry', entry],
    ])) {
      expect(text, name).not.toMatch(/margin(Top|Bottom|Left|Right)\s*:/);
    }
  });
});

describe('spacing comes from the scale', () => {
  const SPACING =
    /^\s*(gap|row-gap|column-gap|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left):\s*([^;]+);/gm;

  /**
   * Every spacing declaration in the stylesheets this plan adds whose value is not on the scale.
   *
   * Only the new files. The page stylesheets carry older rules in rem that this plan touches only
   * where it has a reason to, and failing on those would be noise.
   *
   * @param {string} text
   * @returns {string[]}
   */
  function offenders(text) {
    const bad = [];
    for (const match of text.replace(/\s*!important/g, '').matchAll(SPACING)) {
      for (const part of match[2].trim().split(/\s+/)) {
        if (!/^(0|auto|-?@space-\d+|2px|6px|8px)$/.test(part)) bad.push(match[0].trim());
      }
    }
    return bad;
  }

  it('holds for the four stylesheets this plan adds', () => {
    expect(offenders(saveBarLess)).toEqual([]);
    expect(offenders(badgeLess)).toEqual([]);
    expect(offenders(emptyLess)).toEqual([]);
    expect(offenders(read('ui/src/views/settings/pages/PreferencesPage.less'))).toEqual([]);
  });
});
