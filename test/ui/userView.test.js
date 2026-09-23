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

const mutator = read('ui/src/views/user/mutation/UserMutator.jsx');
const mutatorLess = read('ui/src/views/user/mutation/UserMutator.less');
const removal = read('ui/src/views/user/UserRemovalModal.jsx');
const users = read('ui/src/views/user/Users.jsx');
const login = read('ui/src/views/login/Login.jsx');
const capsLock = read('ui/src/hooks/useCapsLock.js');
const route = read('lib/api/routes/userRoute.js');
const storage = read('lib/services/storage/userStorage.js');

/** Every `<Input … />` in the form, so a prop can be checked against the inputs alone. */
const inputs = [...mutator.matchAll(/<Input\b[\s\S]*?\/>/g)].map(([block]) => block);

/** Every `<Button …>` opening tag, likewise. The icons carry a `size` of their own. */
const buttons = [...mutator.matchAll(/<Button\b[\s\S]*?>/g)].map(([block]) => block);

describe('an existing user can be edited without resetting their password', () => {
  it('lets the route tell a create from an update', () => {
    expect(route).toMatch(/const isUpdate = !nullOrEmpty\(userId\);/);
    expect(route).toMatch(/if \(!isUpdate && nullOrEmpty\(password\)\)/);
  });

  it('no longer demands a password for every save there is', () => {
    expect(route).not.toMatch(/nullOrEmpty\(username\) \|\| nullOrEmpty\(password\)/);
  });

  it('still refuses two that differ, whichever it is', () => {
    expect(route).toMatch(/if \(password !== password2\)/);
  });

  // The branch this unlocks was written for exactly this and had been unreachable.
  it('leaves the storage layer alone, because it was already right', () => {
    expect(storage).toMatch(/Update password only if provided \(non-empty string\)/);
  });
});

describe('the form checks before it sends', () => {
  it('has named rules of its own rather than four ifs in a component', () => {
    expect(mutator).toMatch(/userProblems\(\{ username, password, password2, mode \}\)/);
    expect(mutator).toMatch(/if \(problems\.length > 0\) \{\s*\n\s*return;/);
  });

  it('marks the field rather than dropping a toast in the corner', () => {
    expect(inputs.filter((input) => /validateStatus=/.test(input))).toHaveLength(3);
    expect(mutator).toMatch(/userMutator__error/);
  });

  it('says nothing until Save has been pressed once', () => {
    expect(mutator).toMatch(/const shown = submitted \? problems : \[\];/);
  });
});

describe('two cards, not four, and no dividers between them', () => {
  it('has exactly two SegmentParts', () => {
    expect([...mutator.matchAll(/<SegmentPart/g)]).toHaveLength(2);
  });

  it('draws no line between two bordered cards', () => {
    expect(mutator).not.toMatch(/<Divider/);
    expect(mutator).not.toMatch(/margin="1rem"/);
  });

  it('lays the values out as rows, the way the admin pages do', () => {
    expect([...mutator.matchAll(/<AdminField/g)]).toHaveLength(4);
  });
});

describe('the password fields behave like password fields', () => {
  it("keeps the browser from filling in the admin's own credentials", () => {
    expect([...mutator.matchAll(/autoComplete="new-password"/g)]).toHaveLength(2);
    expect(mutator).toMatch(/autoComplete="username"/);
  });

  it('warns about caps lock, from the one copy of that logic', () => {
    expect(capsLock).toMatch(/getModifierState\('CapsLock'\)/);
    expect(mutator).toMatch(/useCapsLock\(\)/);
    expect(login).toMatch(/useCapsLock\(\)/);
    // One copy, not two: the login screen no longer carries its own.
    expect(login).not.toMatch(/function readCapsLockState/);
  });

  it('does not reload the page when someone presses enter', () => {
    expect(mutator).toMatch(/onSubmit=\{\(event\) => event\.preventDefault\(\)\}/);
  });
});

describe('no props the library does not have', () => {
  it('found all three inputs to check', () => {
    expect(inputs).toHaveLength(3);
  });

  // Checked against the `<Input>` blocks rather than the whole file: `AdminField` takes a `label`
  // of its own, and that one is a prop the component really has.
  it.each([
    ['width', /\bwidth=/],
    ['label', /\blabel=/],
  ])('does not set %s on an Input', (_name, pattern) => {
    expect(inputs.filter((input) => pattern.test(input))).toEqual([]);
  });
});

describe('no styling in the markup', () => {
  it.each([
    ['UserMutator', mutator],
    ['UserRemovalModal', removal],
    ['Users', users],
  ])('%s sets none of it inline', (_name, source) => {
    expect(source).not.toMatch(/style=\{\{/);
    expect(source).not.toMatch(/var\(--f-/);
  });

  it('leaves the buttons their own size', () => {
    // On the buttons, not on the file: the caps lock icon is `size="small"` here as it is on the
    // login screen, and shrinking an icon is not the same as shrinking the primary action.
    expect(buttons.filter((button) => /size="small"/.test(button))).toEqual([]);
  });

  it('measures every gap and margin on the scale', () => {
    const offences = [...mutatorLess.matchAll(/(?:^|\s)(gap|margin|padding)(?:-[a-z]+)?:\s*([^;]+);/g)].filter(
      ([, , value]) => /\d+(\.\d+)?(px|rem|em)/.test(value) && value.trim() !== '0',
    );
    expect(offences.map(([, property, value]) => `${property}: ${value}`)).toEqual([]);
  });
});

describe('saving is the sticky bar the settings and admin pages use', () => {
  it('renders the shared bar rather than a footer of its own', () => {
    expect(mutator).toMatch(/<SettingsSaveBar\b/);
    expect(mutator).toMatch(/dirty=\{dirty\}/);
    expect(mutator).not.toMatch(/userMutator__footer/);
    expect(mutatorLess).not.toMatch(/\.userMutator__footer \{/);
  });

  it('counts a typed password as a change, because there is nothing to compare it to', () => {
    expect(mutator).toMatch(/password\.length > 0 \|\| password2\.length > 0/);
  });

  it('measures dirtiness against what the form was handed', () => {
    expect(mutator).toMatch(/username !== loaded\.username \|\| isAdmin !== loaded\.isAdmin/);
    expect(mutator).toMatch(
      /setLoaded\(\{ username: user\?\.username \|\| '', isAdmin: user\?\.isAdmin \|\| false \}\)/,
    );
  });

  it('warns before the tab is closed on a half-finished edit', () => {
    expect(mutator).toMatch(/useUnsavedWarning\(dirty\)/);
  });

  it('puts the values back rather than only leaving the page', () => {
    expect(mutator).toMatch(/onDiscard=\{discard\}/);
    expect(mutator).toMatch(/const discard = \(\) => \{/);
  });
});

describe('removing a user says what is about to be lost', () => {
  it('names them and counts their jobs', () => {
    expect(removal).toMatch(/user\?\.username/);
    expect(removal).toMatch(/numberOfJobs/);
    expect(removal).toMatch(/messageOneJob/);
    expect(users).toMatch(/users\.find\(\(user\) => user\.id === userId\)/);
  });

  it('confirms in the error colour with the verb, not with an accent OK', () => {
    expect(removal).toMatch(/okText=\{t\('users\.removeUser'\)\}/);
    expect(removal).toMatch(/type: 'danger'/);
  });
});
