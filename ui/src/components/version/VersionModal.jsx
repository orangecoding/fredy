/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { ReleaseNotesDialog } from '../news/newsContent.jsx';

/**
 * The release notes for the version that is available, as a dialog.
 *
 * It used to own both the dialog and the banner that opened it, and that banner sat at the top of
 * every page until somebody upgraded. The footer carries the version number anyway, which makes it
 * the one place a user is already looking when they want to know whether theirs is current.
 *
 * It is the same dialog as the news after an upgrade, said the other way round: available rather
 * than installed, and from the version running here.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 * @returns {React.ReactElement}
 */
export default function VersionModal({ visible, onClose }) {
  const t = useTranslation();
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);

  return (
    <ReleaseNotesDialog
      visible={visible}
      release={versionUpdate}
      eyebrow={t('version.available')}
      fromVersion={versionUpdate.localFredyVersion}
      doneLabel={t('version.modalClose')}
      onDone={onClose}
      onClose={onClose}
    />
  );
}
