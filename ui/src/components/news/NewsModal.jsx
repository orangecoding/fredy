/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';
import { UserGuide } from '@douyinfe/semi-ui-19';
import { useScreenWidth } from '../../hooks/screenWidth';
import heart from '../../assets/heart.png';
import newsConfig from '../../assets/news/news.json';
import { useActions, useSelector } from '../../services/state/store';

import './NewsModal.less';
import { useTranslation } from '../../services/i18n/i18n.jsx';

const newsMedia = import.meta.glob('../../assets/news/*', { eager: true, query: '?url', import: 'default' });

const NewsModal = () => {
  const t = useTranslation();
  const screenWidth = useScreenWidth();
  const newsHash = useSelector((state) => state.userSettings.settings.news_hash);
  const userSettingsLoaded = useSelector((state) => state.userSettings.loaded);
  const pois = useSelector((state) => state.tracking.pois);
  const actions = useActions();
  // Closing the dialog is a decision the user just made; remembering it is a request that can
  // fail. Those were the same thing before - visibility was read straight off the stored hash -
  // so any rejected write (a 403, a database error) left the dialog on screen with no way past
  // it, and the rejection itself went unhandled.
  const [dismissed, setDismissed] = useState(false);

  if (newsConfig == null || newsConfig.content == null || newsConfig.content.length === 0 || screenWidth <= 768) {
    return null;
  }

  const steps = newsConfig.content.map((item) => ({
    title: (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src={heart} width="30" alt="Fredy Logo" style={{ marginRight: '10px' }} />
        <b>{item.title}</b>
      </div>
    ),
    description: (
      <div style={{ textAlign: 'left' }}>
        {item.media &&
          newsMedia[`../../assets/news/${item.media}`] &&
          (item.media.includes('mp4') ? (
            <video controls width="500">
              <source src={newsMedia[`../../assets/news/${item.media}`]} type="video/mp4" />
              {t('news.videoFallback')}
            </video>
          ) : (
            <img
              src={newsMedia[`../../assets/news/${item.media}`]}
              alt={item.title}
              style={{ width: '100%', marginBottom: 10, borderRadius: 4 }}
            />
          ))}
        <p dangerouslySetInnerHTML={{ __html: item.text }} />
      </div>
    ),
  }));

  const handleClose = (poi) => {
    setDismissed(true);
    // Best effort: if the marker cannot be stored the news simply comes back on the next visit,
    // which beats an error toast in front of someone who just closed a welcome dialog. The catch
    // is what keeps it from surfacing as an unhandled rejection.
    actions.userSettings.setNewsHash(newsConfig.key).catch((error) => {
      console.warn('Could not remember that the news were read.', error);
    });
    if (poi) {
      actions.tracking.trackPoi(poi);
    }
  };

  return (
    <UserGuide
      mode="modal"
      mask={true}
      steps={steps}
      visible={!dismissed && userSettingsLoaded && newsHash !== newsConfig.key}
      onFinish={() => handleClose(pois.WELCOME_FINISHED)}
      onSkip={() => handleClose(pois.WELCOME_SKIPPED)}
      modalProps={{
        width: '850px',
      }}
    />
  );
};

export default NewsModal;
