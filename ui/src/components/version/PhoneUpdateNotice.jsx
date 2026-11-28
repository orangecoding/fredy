/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';

import { useSelector } from '../../services/state/store.js';
import UpdateToast from './UpdateToast.jsx';
import VersionModal from './VersionModal.jsx';

/**
 * The update toast on a phone.
 *
 * On a wide screen the footer owns the toast, next to the version chip it announces. A phone has no
 * footer - the version line sits at the foot of the menu, which is closed most of the time - so the
 * shell carries the toast and the release notes it opens itself.
 *
 * @returns {React.ReactElement|null}
 */
export default function PhoneUpdateNotice() {
  const [notesVisible, setNotesVisible] = useState(false);
  const hasUpdate = useSelector((state) => Boolean(state.versionUpdate.versionUpdate?.newVersion));
  if (!hasUpdate) {
    return null;
  }
  return (
    <>
      <UpdateToast onShowNotes={() => setNotesVisible(true)} />
      <VersionModal visible={notesVisible} onClose={() => setNotesVisible(false)} />
    </>
  );
}

PhoneUpdateNotice.displayName = 'PhoneUpdateNotice';
