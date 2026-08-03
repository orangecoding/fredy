/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import { UserGuide, SideSheet, Button } from '@douyinfe/semi-ui-19';

import { useScreenWidth } from '../../hooks/screenWidth';
import newsConfig from '../../assets/news/news.json';
import { newestVersion, selectUnseenReleases } from '../../services/news/newsSelection.js';
import { useActions, useSelector } from '../../services/state/store';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import { NewsEntryBody, NewsEntryTitle, toSteps } from './newsContent.jsx';

import './NewsModal.less';

/**
 * What arrived since this user last looked.
 *
 * Two things changed here. It is keyed by release version rather than by a hash of the current
 * payload, so somebody who skipped two releases is told about both instead of neither. And it no
 * longer disappears below 768px: a phone gets the same content as a sheet from the bottom, which is
 * where a narrow screen wants a dialog anyway.
 *
 * @returns {React.ReactElement|null}
 */
const NewsModal = () => {
  const t = useTranslation();
  const screenWidth = useScreenWidth();
  const lastSeen = useSelector((state) => state.userSettings.settings.news_last_seen_version);
  const userSettingsLoaded = useSelector((state) => state.userSettings.loaded);
  const pois = useSelector((state) => state.tracking.pois);
  const actions = useActions();

  // Closing the dialog is a decision the user just made; remembering it is a request that can
  // fail. Those were the same thing before - visibility was read straight off the stored marker -
  // so any rejected write (a 403, a database error) left the dialog on screen with no way past it,
  // and the rejection itself went unhandled.
  const [dismissed, setDismissed] = useState(false);

  const newest = useMemo(() => newestVersion(newsConfig), []);
  const unseen = useMemo(() => selectUnseenReleases(newsConfig, lastSeen), [lastSeen]);

  // Somebody who has no marker at all is new here. Rather than greeting them with the history of a
  // product they have not used yet, record where they came in and say nothing.
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

  const steps = useMemo(() => toSteps(unseen), [unseen]);
  const visible = !dismissed && userSettingsLoaded && steps.length > 0;

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

  // Below this width the anchored popover chrome of UserGuide has nowhere to go, so the same
  // entries are stacked in a sheet instead. Nothing is withheld from a phone.
  if (screenWidth <= 768) {
    return (
      <SideSheet
        visible
        placement="bottom"
        height="90%"
        title={t('news.sheetTitle')}
        onCancel={() => handleClose(pois.WELCOME_SKIPPED)}
        className="news__sheet"
      >
        {unseen.map((release) =>
          release.entries.map((entry, index) => (
            <div key={`${release.version}-${index}`} className="news__sheet-entry">
              <NewsEntryTitle entry={entry} version={release.version} />
              <NewsEntryBody entry={entry} />
            </div>
          )),
        )}
        <Button theme="solid" type="primary" block onClick={() => handleClose(pois.WELCOME_FINISHED)}>
          {t('news.sheetDone')}
        </Button>
      </SideSheet>
    );
  }

  return (
    <UserGuide
      mode="modal"
      mask={true}
      steps={steps}
      visible
      onFinish={() => handleClose(pois.WELCOME_FINISHED)}
      onSkip={() => handleClose(pois.WELCOME_SKIPPED)}
      modalProps={{
        width: '850px',
      }}
    />
  );
};

NewsModal.displayName = 'NewsModal';

export default NewsModal;
