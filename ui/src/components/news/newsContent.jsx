/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import heart from '../../assets/heart.png';
import { useTranslation } from '../../services/i18n/i18n.jsx';

/**
 * Every file next to news.json, keyed by the path the entries refer to.
 *
 * Resolved at build time so a missing screenshot is a blank space rather than a broken request.
 */
const newsMedia = import.meta.glob('../../assets/news/*', { eager: true, query: '?url', import: 'default' });

/**
 * The screenshot or clip belonging to one entry, if it has one and the file exists.
 *
 * @param {import('../../services/news/newsSelection.js').NewsEntry} entry
 * @param {string} fallbackAlt
 * @returns {React.ReactElement|null}
 */
export function NewsMedia({ entry, fallbackAlt }) {
  const t = useTranslation();
  const src = entry.media ? newsMedia[`../../assets/news/${entry.media}`] : null;
  if (!src) {
    return null;
  }
  if (entry.media.endsWith('.mp4')) {
    return (
      <video controls className="news__media">
        <source src={src} type="video/mp4" />
        {t('news.videoFallback')}
      </video>
    );
  }
  return <img src={src} alt={entry.title || fallbackAlt} className="news__media" />;
}

NewsMedia.displayName = 'NewsMedia';

/**
 * One entry: its screenshot, then its prose.
 *
 * The text is authored HTML from news.json, written by whoever cut the release. It is not user
 * input and never has been, which is what makes rendering it directly acceptable here.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsEntry} props.entry
 * @returns {React.ReactElement}
 */
export function NewsEntryBody({ entry }) {
  return (
    <div className="news__entry">
      <NewsMedia entry={entry} fallbackAlt={entry.title} />
      <p dangerouslySetInnerHTML={{ __html: entry.text ?? '' }} />
    </div>
  );
}

NewsEntryBody.displayName = 'NewsEntryBody';

/**
 * An entry's heading: the Fredy heart, the title, and which release it arrived in.
 *
 * The version is part of the title rather than a separate line because it is the one thing that
 * makes a stack of entries legible when several releases are shown at once.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsEntry} props.entry
 * @param {string} props.version
 * @returns {React.ReactElement}
 */
export function NewsEntryTitle({ entry, version }) {
  return (
    <div className="news__title">
      <img src={heart} width="30" alt="" className="news__title-mark" />
      <b>{entry.title}</b>
      <span className="news__version">v{version}</span>
    </div>
  );
}

NewsEntryTitle.displayName = 'NewsEntryTitle';

/**
 * Flatten releases into the steps Semi's UserGuide walks through.
 *
 * One step per entry rather than one per release: a release with three things worth saying should
 * be three screens, not one wall.
 *
 * @param {import('../../services/news/newsSelection.js').NewsRelease[]} releases
 * @returns {{title: React.ReactNode, description: React.ReactNode}[]}
 */
export function toSteps(releases) {
  return releases.flatMap((release) =>
    release.entries.map((entry) => ({
      title: <NewsEntryTitle entry={entry} version={release.version} />,
      description: <NewsEntryBody entry={entry} />,
    })),
  );
}
