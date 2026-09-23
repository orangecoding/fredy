/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button } from '@douyinfe/semi-ui-19';
import { IconSave } from '@douyinfe/semi-icons';

import { useTranslation } from '../../services/i18n/i18n.jsx';

import './SettingsSaveBar.less';

/**
 * The bar that says something is unsaved, and saves it.
 *
 * Sticky at the bottom of the page rather than a button at the end of it. On the application page
 * six cards and a preview of up to 28 lines sit between the first field and where that button used
 * to be, so somebody correcting their first name had to scroll past everything to commit it and saw
 * nothing on the way reminding them to.
 *
 * Renders nothing while there is nothing to save. What stood there before was a greyed-out button,
 * and a button that never does anything looks like a broken button.
 *
 * Discard is deliberately here rather than only in the browser's back button: every one of these
 * pages already knows how to rebuild its form from the store, so "undo what I typed" is one line,
 * and without it the only way out of a half-finished edit is to reload the page.
 *
 * @param {Object} props
 * @param {boolean} props.dirty
 * @param {boolean} [props.saving=false]
 * @param {() => void} props.onSave
 * @param {() => void} props.onDiscard
 * @param {string|null} [props.note] Replaces the standard sentence, for a page whose save does
 *   something beyond saving - System reloads the browser, and that has to be readable before the
 *   button is pressed rather than in the toast afterwards.
 * @param {React.ReactNode} [props.status] Replaces the dot and the sentence outright, for a form
 *   whose "not saved yet" has more to say than that. The job form puts its readiness list here, so
 *   that a Save disabled for a missing provider says so in the same bar as the button.
 * @param {boolean} [props.saveDisabled=false] Whether saving is refused for now. Only for a form
 *   that says elsewhere in the bar why - a disabled button with nothing next to it is the thing
 *   `status` exists to avoid.
 * @param {string} [props.saveLabel] Replaces "Save", for a form where what is being saved is worth
 *   naming: on a settings page the page title says it, on the job form the bar can be the first
 *   thing read after a scroll past ten cards.
 * @param {string} [props.discardLabel] Replaces "Discard", likewise.
 * @returns {React.ReactElement|null}
 */
export default function SettingsSaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  note = null,
  status = null,
  saveDisabled = false,
  saveLabel = null,
  discardLabel = null,
}) {
  const t = useTranslation();

  if (!dirty) {
    return null;
  }

  return (
    <div className="settingsSaveBar" role="status">
      {status ?? (
        <span className="settingsSaveBar__label">
          <span className="settingsSaveBar__dot" aria-hidden="true" />
          {note ?? t('settings.unsavedChanges')}
        </span>
      )}
      <span className="settingsSaveBar__actions">
        {/* Both refused while a save is in flight. Semi's `loading` only sets `pointer-events: none`,
            so Enter on the focused button saved a second time (a new job twice), and a Discard in
            the middle reset the form under a save that then landed anyway. */}
        <Button className="settingsSaveBar__discard" theme="outline" size="small" disabled={saving} onClick={onDiscard}>
          {discardLabel ?? t('settings.discard')}
        </Button>
        <Button
          className="settingsSaveBar__save"
          icon={<IconSave />}
          theme="solid"
          type="primary"
          size="small"
          disabled={saveDisabled || saving}
          loading={saving}
          onClick={onSave}
        >
          {saveLabel ?? t('settings.save')}
        </Button>
      </span>
    </div>
  );
}

SettingsSaveBar.displayName = 'SettingsSaveBar';
