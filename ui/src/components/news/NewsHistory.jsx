/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useMemo, useState } from 'react';
import { SideSheet, Tooltip } from '@douyinfe/semi-ui-19';
import { IconBell } from '@douyinfe/semi-icons';

import newsConfig from '../../assets/news/news.json';
import { allReleases, selectUnseenReleases } from '../../services/news/newsSelection.js';
import { useSelector } from '../../services/state/store.js';
import { useTranslation, useLocale } from '../../services/i18n/i18n.jsx';
import { NewsEntryBody } from './newsContent.jsx';

import './NewsModal.less';

/**
 * Everything Fredy has announced, newest first, openable at any time.
 *
 * The dialog that appears on its own is easy to dismiss without reading, and until now that was
 * the end of it - there was no way back to what it had said. This is that way back, and it is also
 * where somebody who upgrades several versions at once can go and read the rest at their own pace.
 *
 * @param {Object} props
 * @param {boolean} props.collapsed Whether the sidebar is showing icons only.
 * @returns {React.ReactElement|null}
 */
export default function NewsHistory({ collapsed }) {
  const t = useTranslation();
  const locale = useLocale();
  const [visible, setVisible] = useState(false);
  const releases = useMemo(() => allReleases(newsConfig), []);
  // The same marker the dialog that appears on its own writes when it is dismissed, so the dot on
  // the bell means what the dialog would have said and goes out when it has been said. Nothing is
  // invented here: a user with no marker stored - a fresh account - has no unseen releases by
  // definition, so the dot stays off rather than greeting them with a history they have no use for.
  const lastSeen = useSelector((state) => state.userSettings.settings.news_last_seen_version);
  const hasUnread = useMemo(() => selectUnseenReleases(newsConfig, lastSeen).length > 0, [lastSeen]);

  if (releases.length === 0) {
    return null;
  }

  const formatDate = (value) => {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale, { dateStyle: 'long' });
  };

  // A bell in the account row rather than a labelled block of its own above the support button.
  // The name it used to carry in full is now the tooltip and the aria-label, which is what it was
  // doing for the icon rail already.
  const trigger = (
    <button
      type="button"
      className="navigate__accountAction"
      onClick={() => setVisible(true)}
      aria-label={t('nav.news')}
    >
      <IconBell size="default" />
      {hasUnread && <span className="navigate__badge" />}
    </button>
  );

  return (
    <>
      {/* The tooltip only exists for the icon rail, where the label is hidden and the button needs
          something to name it. It used to be rendered either way and switched off with
          trigger="custom" when expanded - where it never fired, but its wrapper is inline, so the
          button's `width: 100%` resolved against its own text and came out narrower than the
          Support button below it. */}
      {collapsed ? (
        <Tooltip content={t('news.historyTitle')} position="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}

      <SideSheet
        title={t('news.historyTitle')}
        visible={visible}
        onCancel={() => setVisible(false)}
        width={560}
        className="news__sheet"
      >
        {releases.map((release) => (
          <section key={release.version} className="news__release">
            <header className="news__releaseHeader">
              <h3 className="news__releaseVersion">v{release.version}</h3>
              {formatDate(release.date) && <span className="news__releaseDate">{formatDate(release.date)}</span>}
            </header>
            {release.entries.map((entry, index) => (
              <article key={index} className="news__historyEntry">
                <h4 className="news__historyEntryTitle">{entry.title}</h4>
                <NewsEntryBody entry={entry} />
              </article>
            ))}
          </section>
        ))}
      </SideSheet>
    </>
  );
}

NewsHistory.displayName = 'NewsHistory';
