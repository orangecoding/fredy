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
 * @returns {React.ReactElement|null}
 */
export default function SettingsSaveBar({ dirty, saving = false, onSave, onDiscard }) {
  const t = useTranslation();

  if (!dirty) {
    return null;
  }

  return (
    <div className="settingsSaveBar" role="status">
      <span className="settingsSaveBar__label">
        <span className="settingsSaveBar__dot" aria-hidden="true" />
        {t('settings.unsavedChanges')}
      </span>
      <span className="settingsSaveBar__actions">
        <Button className="settingsSaveBar__discard" theme="outline" size="small" onClick={onDiscard}>
          {t('settings.discard')}
        </Button>
        <Button
          className="settingsSaveBar__save"
          icon={<IconSave />}
          theme="solid"
          type="primary"
          size="small"
          loading={saving}
          onClick={onSave}
        >
          {t('settings.save')}
        </Button>
      </span>
    </div>
  );
}

SettingsSaveBar.displayName = 'SettingsSaveBar';
