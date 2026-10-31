/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { Button } from '@douyinfe/semi-ui-19';
import { IconClose } from '@douyinfe/semi-icons';

import heart from '../../assets/heart.png';
import { compareVersions } from '../../services/news/newsSelection.js';
import { useActions, useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './UpdateToast.less';

/**
 * Says once that a new version is out, then leaves it to the chip in the footer.
 *
 * The chip alone was easy to miss down there; a notice that stays until somebody updates would
 * nag. So each available version is announced once per user: whichever way the toast is closed,
 * the version is remembered (`update_notice_seen_version`) and the next release gets its own.
 *
 * @param {Object} props
 * @param {() => void} props.onShowNotes Opens the release notes of the available version.
 * @returns {React.ReactElement|null}
 */
export default function UpdateToast({ onShowNotes }) {
  const t = useTranslation();
  const actions = useActions();
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  const settingsLoaded = useSelector((state) => state.userSettings.loaded);
  const seen = useSelector((state) => state.userSettings.settings.update_notice_seen_version);
  const demoMode = useSelector((state) => state.generalSettings.settings.demoMode);
  // Closing is the user's decision; remembering it is a request that can fail, and the toast must
  // not stay on screen because of that.
  const [dismissed, setDismissed] = useState(false);

  const version = versionUpdate?.version;
  const alreadySeen = seen != null && compareVersions(seen, version) >= 0;
  if (dismissed || demoMode || !settingsLoaded || !versionUpdate?.newVersion || alreadySeen) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    actions.userSettings.setUpdateNoticeSeenVersion(version).catch((error) => {
      console.warn('Could not remember that the update notice was seen.', error);
    });
  };

  return (
    <section className="updateToast" role="status" aria-label={t('version.available')}>
      <span className="updateToast__mark">
        <img src={heart} alt="" />
      </span>
      <div className="updateToast__text">
        <span className="updateToast__title">{t('version.toastTitle', { version })}</span>
        <span className="updateToast__body">
          {t('version.toastBody', { current: versionUpdate.localFredyVersion })}
        </span>
        <div className="updateToast__actions">
          <Button
            theme="solid"
            type="primary"
            onClick={() => {
              dismiss();
              onShowNotes();
            }}
          >
            {t('version.whatsNew')}
          </Button>
          <Button onClick={dismiss}>{t('version.later')}</Button>
        </div>
      </div>
      <Button
        className="updateToast__close"
        theme="borderless"
        type="tertiary"
        icon={<IconClose />}
        aria-label={t('version.modalClose')}
        onClick={dismiss}
      />
    </section>
  );
}
