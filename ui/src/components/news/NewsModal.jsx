/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';

import { newestVersion, selectUnseenRelease } from '../../services/news/newsSelection.js';
import { useActions, useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { ReleaseNotesDialog } from './newsContent.jsx';

/**
 * The release notes of the version somebody just upgraded to, shown once.
 *
 * Keyed by release version rather than by a hash of the current payload, so the marker stored in
 * the user settings says which notes have been shown, whatever happened in between.
 *
 * @returns {React.ReactElement|null}
 */
const NewsModal = () => {
  const t = useTranslation();
  const lastSeen = useSelector((state) => state.userSettings.settings.news_last_seen_version);
  const userSettingsLoaded = useSelector((state) => state.userSettings.loaded);
  const pois = useSelector((state) => state.tracking.pois);
  const releases = useSelector((state) => state.news.releases);
  const actions = useActions();

  // Closing the dialog is a decision the user just made; remembering it is a request that can
  // fail. Those were the same thing before - visibility was read straight off the stored marker -
  // so any rejected write (a 403, a database error) left the dialog on screen with no way past it,
  // and the rejection itself went unhandled.
  const [dismissed, setDismissed] = useState(false);

  const newest = useMemo(() => newestVersion(releases), [releases]);
  const unseen = useMemo(() => selectUnseenRelease(releases, lastSeen), [releases, lastSeen]);

  // Somebody who has no marker at all is new here. Rather than greeting them with the history of a
  // product they have not used yet, record where they came in and say nothing. Until the releases
  // have arrived from GitHub there is no `newest`, so nothing is recorded early.
  useEffect(() => {
    if (!userSettingsLoaded || newest == null) {
      return;
    }
    if (lastSeen == null || String(lastSeen).length === 0) {
      actions.userSettings.setNewsLastSeenVersion(newest).catch((error) => {
        console.warn('Could not record the news starting point for this user.', error);
      });
    }
  }, [userSettingsLoaded, lastSeen, newest, actions.userSettings]);

  const visible = !dismissed && userSettingsLoaded && unseen != null;

  const handleClose = (poi) => {
    setDismissed(true);
    // Best effort: if the marker cannot be stored the news simply comes back on the next visit,
    // which beats an error toast in front of someone who just closed a welcome dialog. The catch
    // is what keeps it from surfacing as an unhandled rejection.
    actions.userSettings.setNewsLastSeenVersion(newest).catch((error) => {
      console.warn('Could not remember that the news were read.', error);
    });
    if (poi) {
      actions.tracking.trackPoi(poi);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <ReleaseNotesDialog
      release={unseen}
      eyebrow={t('news.updated')}
      fromVersion={lastSeen}
      doneLabel={t('news.sheetDone')}
      onDone={() => handleClose(pois.WELCOME_FINISHED)}
      onClose={() => handleClose(pois.WELCOME_SKIPPED)}
    />
  );
};

NewsModal.displayName = 'NewsModal';

export default NewsModal;
