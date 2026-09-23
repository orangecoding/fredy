/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { JOB_REQUIREMENTS } from '../../ui/src/services/jobs/jobValidation.js';
import { SECTION_BY_REQUIREMENT } from '../../ui/src/views/jobs/mutation/jobSections.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

const form = read('ui/src/views/jobs/mutation/JobMutation.jsx');
const formLess = read('ui/src/views/jobs/mutation/JobMutation.less');
const bar = read('ui/src/views/jobs/mutation/JobReadinessBar.jsx');
const barLess = read('ui/src/views/jobs/mutation/JobReadinessBar.less');
const providerTable = read('ui/src/components/table/ProviderTable.jsx');
const providerTableLess = read('ui/src/components/table/ProviderTable.less');
const mutator = read('ui/src/views/jobs/mutation/components/provider/ProviderMutator.jsx');
const mutatorLess = read('ui/src/views/jobs/mutation/components/provider/ProviderMutator.less');
const picker = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelPicker.jsx');
const pickerLess = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelPicker.less');
const editor = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelEditor.jsx');
const editorLess = read('ui/src/views/jobs/mutation/components/notificationAdapter/NotificationChannelEditor.less');
const bar2 = read('ui/src/components/settingsShell/SettingsSaveBar.jsx');
const bar2Less = read('ui/src/components/settingsShell/SettingsSaveBar.less');

const ALL_JSX = [
  ['JobMutation', form],
  ['ProviderTable', providerTable],
  ['ProviderMutator', mutator],
  ['NotificationChannelPicker', picker],
  ['NotificationChannelEditor', editor],
  ['JobReadinessBar', bar],
];

const ALL_LESS = [
  ['JobMutation', formLess],
  ['JobReadinessBar', barLess],
  ['ProviderTable', providerTableLess],
  ['ProviderMutator', mutatorLess],
  ['NotificationChannelPicker', pickerLess],
  ['NotificationChannelEditor', editorLess],
];

describe('the save button finally says why it is disabled', () => {
  it('renders the list that both files described for months', () => {
    expect(form).toMatch(/<JobReadinessBar missing=\{missing\}/);
    expect(bar).toMatch(/missing\.map\(/);
  });

  it('can send the user to every requirement there is', () => {
    for (const requirement of JOB_REQUIREMENTS) {
      expect(SECTION_BY_REQUIREMENT[requirement.key], requirement.key).toBeTypeOf('string');
    }
  });

  it('anchors every one of those sections in the form', () => {
    for (const id of Object.values(SECTION_BY_REQUIREMENT)) {
      // The anchors are rendered from the map, so what is asserted is that the helper that does it
      // is used once per requirement rather than that four literal ids appear.
      expect(id).toMatch(/^jobSection-/);
    }
    // Sections, not requirements: name and deal type are two rows of the same Grunddaten card and
    // therefore share one anchor, which is exactly what the map is for.
    const anchors = form.match(/anchorProps\('/g) ?? [];
    expect(anchors).toHaveLength(new Set(Object.values(SECTION_BY_REQUIREMENT)).size);
  });

  it('respects a request for less motion when it jumps', () => {
    const sections = read('ui/src/views/jobs/mutation/jobSections.js');
    expect(sections).toMatch(/prefers-reduced-motion/);
  });

  it('keeps the button disabled - it explains it, it does not weaken it', () => {
    expect(form).toMatch(/saveDisabled=\{missing\.length > 0\}/);
  });
});

describe('the save bar is the one the rest of the app uses', () => {
  it('is the settings bar, carrying the readiness list as its status', () => {
    expect(form).toMatch(/<SettingsSaveBar/);
    expect(form).toMatch(/status=\{<JobReadinessBar missing=\{missing\} onJump=\{setHighlighted\} \/>\}/);
  });

  it('only appears once there is something to save', () => {
    expect(form).toMatch(/dirty=\{dirty\}/);
    // A stored job compares against what is stored; one that is not stored yet (new, or a clone)
    // is unsaved as soon as it holds anything, so a clone saved as it came still gets its Save.
    expect(form).toMatch(
      /const dirty = params\.jobId == null \? hasContent\(current\) : isJobDirty\(current, baseline\);/,
    );
    // Renders nothing while clean - the whole point of the bar arriving rather than sitting there
    // greyed out.
    expect(bar2).toMatch(/if \(!dirty\) \{\s*\n\s*return null;/);
  });

  it('sticks to the bottom instead of scrolling away', () => {
    expect(bar2Less).toMatch(/position: sticky/);
  });

  it('says what is still open, and stops saying anything once nothing is', () => {
    expect(bar).toMatch(/jobs\.mutation\.stillOpen/);
    expect(bar).toMatch(/if \(missing\.length === 0\) \{\s*\n\s*return null;/);
  });

  it('offers a discard that puts the form back to what is stored', () => {
    expect(form).toMatch(/onDiscard=\{discardChanges\}/);
    expect(form).toMatch(/setName\(baseline\.name\)/);
  });

  it('warns before the tab is closed on a half-finished job', () => {
    expect(form).toMatch(/useUnsavedWarning\(dirty\)/);
  });

  it('no longer keeps a footer of its own', () => {
    for (const dead of ['jobMutation__footerActions', 'jobMutation__footer']) {
      expect(formLess, dead).not.toContain(dead);
      expect(form, dead).not.toContain(dead);
    }
  });
});

describe('the form is laid out the way the artboard draws it', () => {
  it('puts name and deal type in one Grunddaten card', () => {
    expect(form).toMatch(/name=\{t\('jobs\.mutation\.sectionBasics'\)\}/);
    expect(form).not.toMatch(/jobs\.mutation\.sectionDealType/);
    expect(SECTION_BY_REQUIREMENT.name).toBe(SECTION_BY_REQUIREMENT.dealType);
  });

  it('draws a labelled row the way the administration does', () => {
    // The same component, not a second implementation of the same row: the artboard draws one
    // label-left control-right row and the admin pages already had it.
    expect(form).toMatch(/<AdminField/);
    for (const dead of ['jobMutation__publicationRow', 'jobMutation__publicationLabel']) {
      expect(form, dead).not.toContain(dead);
      expect(formLess, dead).not.toContain(dead);
    }
  });

  it('keeps the add action in both card headers, empty or not', () => {
    // It used to appear only once the list had something in it, so the empty state was the only
    // way in and the header jumped into existence on the first save.
    expect(form).not.toMatch(/providerData\.length === 0 \? null/);
    expect(form).not.toMatch(/selectedChannels\.length === 0 \? null/);
    expect(form).toMatch(/jobs\.mutation\.addShort/);
  });

  it('shares one card for sharing and activation', () => {
    expect(form).toMatch(/jobs\.mutation\.sectionSharingActivation/);
    expect(form).toMatch(/jobs\.mutation\.labelRunning/);
  });
});

describe('the two required steps look like steps, not like empty results', () => {
  it.each(['providerEmptyTitle', 'channelEmptyTitle'])('has an empty state for %s', (key) => {
    expect(form).toContain(`jobs.mutation.${key}`);
  });

  it('uses the one the rest of the app uses', () => {
    expect(form).toMatch(/<SettingsEmptyState/);
    expect(picker).toMatch(/<SettingsEmptyState/);
  });
});

describe('no colour, spacing or type in the markup', () => {
  it.each(ALL_JSX)('%s sets none of them inline', (_name, source) => {
    expect(source).not.toMatch(/style=\{\{[^}]*\b(color|margin|padding|gap|fontSize|fontWeight|lineHeight)\b/);
  });

  it.each(ALL_JSX)('%s does not lay out with float', (_name, source) => {
    expect(source).not.toMatch(/float:/);
  });
});

describe('the stylesheets speak Fredy', () => {
  it.each(ALL_LESS)('%s imports the tokens', (_name, source) => {
    expect(source).toMatch(/@import .*tokens\.less/);
  });

  it.each(ALL_LESS)("%s uses none of Semi's palette", (_name, source) => {
    expect(source).not.toMatch(/var\(--semi-color-/);
  });

  it.each(ALL_LESS)('%s measures every gap and margin on the scale', (_name, source) => {
    // Rem and px are allowed for sizes (widths, heights, max-widths) and for 1px borders; they are
    // not allowed for the four properties that make up the rhythm of a page.
    const offences = [...source.matchAll(/(?:^|\s)(gap|margin|padding)(?:-[a-z]+)?:\s*([^;]+);/g)].filter(
      ([, , value]) => /\d+(\.\d+)?(px|rem|em)/.test(value) && !/^0$/.test(value.trim()),
    );
    expect(offences.map(([, property, value]) => `${property}: ${value}`)).toEqual([]);
  });

  it('no longer widens every select list in the application', () => {
    expect(formLess).not.toMatch(/^\.semi-select-option-list-wrapper/m);
    expect(mutatorLess).not.toMatch(/\.providerMutator \.semi-select-option-list-wrapper/);
    // Bound by name, because Semi renders the list in a portal at document.body.
    expect(form).toMatch(/dropdownClassName=/);
    expect(mutator).toMatch(/dropdownClassName="providerMutator__dropdown"/);
  });

  it('has no class left over that nothing uses', () => {
    for (const dead of ['jobMutation__actions', 'jobMutation__newButton', 'jobMutation__notificationActions']) {
      expect(formLess, dead).not.toContain(dead);
      expect(form, dead).not.toContain(dead);
    }
  });
});

describe('one primary action per surface', () => {
  it("spends Semi's blue nowhere", () => {
    for (const [name, source] of ALL_JSX) {
      expect(source, name).not.toMatch(/type="secondary"/);
    }
  });

  it('gives the provider row two quiet buttons instead of a filled pair', () => {
    expect(providerTable).toMatch(/theme="borderless"[\s\S]{0,80}IconEdit/);
    expect(providerTable).not.toMatch(/width: '16px'/);
    expect(providerTableLess).toMatch(/justify-content: flex-end/);
  });

  it('names the action column instead of leaving its header blank', () => {
    expect(providerTable).not.toMatch(/title: '',/);
    expect(providerTable).toMatch(/provider\.tableColumnActions/);
  });

  it('gives the channel editor one row of three buttons and no float', () => {
    expect(editor).toMatch(/channelEditor__footer/);
    expect(editorLess).toMatch(/&__footer \{[\s\S]*?display: flex/);
  });
});

describe('a list of problems is rendered as a list', () => {
  it('no longer glues the channel validation into HTML', () => {
    expect(editor).not.toMatch(/dangerouslySetInnerHTML/);
    expect(editor).not.toMatch(/join\('<br\/>'\)/);
    expect(editor).toMatch(/validationProblems\.map\(/);
  });
});

describe('the fold invites once, not three times', () => {
  it('drops the uppercase accent pill', () => {
    const block = formLess.match(/\.jobMutation__refineToggle \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/text-transform/);
    expect(block[0]).not.toMatch(/@color-accent/);
  });

  it('keeps the header a control without painting it accent', () => {
    const block = formLess.match(/\.semi-collapse-header \{[\s\S]*?\n {2}\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/cursor: pointer/);
    expect(block[0]).not.toMatch(/@color-accent/);
  });
});

describe('the comments say what the code does', () => {
  it('counts four requirements, not three', () => {
    expect(form).not.toMatch(/The three things a job cannot exist without/);
    expect(form).toMatch(/The four things a job cannot exist without/);
  });

  it('no longer claims everything optional is folded away', () => {
    expect(form).not.toMatch(/Everything optional is\s*\n?\s*(?:\*\s*)?folded away/);
  });
});

describe('the German copy says Anbieter', () => {
  it('has no Portal left in the provider strings', () => {
    const de = JSON.parse(read('ui/src/locales/de.json'));
    for (const [key, value] of Object.entries(de)) {
      if (!key.startsWith('provider.')) continue;
      expect(`${key}: ${value}`).not.toMatch(/Portal/);
    }
  });
});
