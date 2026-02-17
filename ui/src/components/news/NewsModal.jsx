/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { UserGuide } from '@douyinfe/semi-ui-19';
import { useScreenWidth } from '../../hooks/screenWidth';
import heart from '../../assets/heart.png';
import newsConfig from '../../assets/news/news.json';
import { useActions, useSelector } from '../../services/state/store';

import './NewsModal.less';

const newsImages = import.meta.glob('../../assets/news/*', { eager: true, query: '?url', import: 'default' });

const NewsModal = () => {
  const screenWidth = useScreenWidth();
  const newsHash = useSelector((state) => state.userSettings.settings.news_hash);
  const userSettingsLoaded = useSelector((state) => state.userSettings.loaded);
  const pois = useSelector((state) => state.tracking.pois);
  const actions = useActions();

  if (newsConfig == null || newsConfig.length === 0 || screenWidth <= 768) {
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
        {item.image && newsImages[`../../assets/news/${item.image}`] && (
          <img
            src={newsImages[`../../assets/news/${item.image}`]}
            alt={item.title}
            style={{ width: '100%', marginBottom: 10, borderRadius: 4 }}
          />
        )}
        <p dangerouslySetInnerHTML={{ __html: item.text }} />
      </div>
    ),
  }));

  const handleClose = (poi) => {
    actions.userSettings.setNewsHash(newsConfig.key);
    if (poi) {
      actions.tracking.trackPoi(poi);
    }
  };

  return (
    <UserGuide
      mode="modal"
      mask={true}
      steps={steps}
      visible={userSettingsLoaded && newsHash !== newsConfig.key}
      onFinish={() => handleClose(pois.WELCOME_FINISHED)}
      onSkip={() => handleClose(pois.WELCOME_SKIPPED)}
      modalProps={{
        width: '10rem',
      }}
    />
  );
};

export default NewsModal;
