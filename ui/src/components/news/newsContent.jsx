/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useRef, useState } from 'react';
import { Button, Modal, SideSheet } from '@douyinfe/semi-ui-19';
import { IconClose } from '@douyinfe/semi-icons';

import heart from '../../assets/heart.png';
import { IconArrowRight, IconExternal } from '../icons/StrokeIcons.jsx';
import { useScreenWidth } from '../../hooks/screenWidth';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';

import '../../releaseNotes.less';
import './NewsModal.less';

/**
 * The sections the contents scroll to: the same top-level headings the server counted for the
 * outline (`releaseOutline` in `lib/services/markdown.js`), so the n-th entry is the n-th match.
 * @type {string}
 */
const SECTION_HEADINGS = '.releaseNotes > h1, .releaseNotes > h2, .releaseNotes > h3';

/**
 * How far below the top of the notes a section heading lands, and still counts as current.
 * @type {number}
 */
const SECTION_OFFSET = 16;

/**
 * A release date as the reader writes dates, or `null` when there is none worth showing.
 *
 * @param {string|undefined} value ISO timestamp.
 * @param {string} locale
 * @returns {string|null}
 */
export function formatReleaseDate(value, locale) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale, { dateStyle: 'long' });
}

/**
 * One release's notes, as published on GitHub.
 *
 * The HTML comes from the server, which renders the release markdown and runs it through
 * `markdownToSafeHtml` (`lib/services/markdown.js`) before it ever reaches the browser. That
 * sanitising is what makes injecting it here acceptable.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsRelease} props.release
 * @returns {React.ReactElement}
 */
export function NewsReleaseBody({ release }) {
  return <div className="news__entry releaseNotes" dangerouslySetInnerHTML={{ __html: release.bodyHtml ?? '' }} />;
}

NewsReleaseBody.displayName = 'NewsReleaseBody';

/**
 * The top of a release notes dialog: which release, when, and which version it follows on from.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsRelease} props.release
 * @param {string} props.eyebrow What happened with it: installed, or available.
 * @param {string} [props.fromVersion] The version it is compared with.
 * @returns {React.ReactElement}
 */
function ReleaseHeader({ release, eyebrow, fromVersion }) {
  const locale = useLocale();
  const date = formatReleaseDate(release.date, locale);
  return (
    <div className="news__header">
      <span className="news__mark">
        <img src={heart} alt="" />
      </span>
      <div className="news__headerText">
        <span className="news__eyebrow">{eyebrow}</span>
        <span className="news__headerTitle">Fredy {release.version}</span>
        <span className="news__meta">
          {date && <span>{date}</span>}
          {fromVersion && fromVersion !== release.version && (
            <span className="news__versions">
              {fromVersion}
              <IconArrowRight aria-hidden="true" />
              <span className="news__versionsTo">{release.version}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * The way to the full release page on GitHub, or nothing for a release without one.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsRelease} props.release
 * @returns {React.ReactElement|null}
 */
function GithubLink({ release }) {
  const t = useTranslation();
  if (!release.url) {
    return null;
  }
  return (
    <a className="news__githubLink" href={release.url} target="_blank" rel="noopener noreferrer">
      {t('version.viewOnGithub')}
      <IconExternal aria-hidden="true" />
    </a>
  );
}

/**
 * Closing the dialog, and the way to the full release page.
 *
 * The button comes first in the markup because it is the one thing most people do here; the
 * stylesheet puts it on the right of a dialog and on top of a sheet.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsRelease} props.release
 * @param {string} props.doneLabel
 * @param {() => void} props.onDone
 * @returns {React.ReactElement}
 */
function ReleaseActions({ release, doneLabel, onDone }) {
  return (
    <div className="news__actions">
      <Button theme="solid" type="primary" className="news__done" onClick={onDone}>
        {doneLabel}
      </Button>
      <GithubLink release={release} />
    </div>
  );
}

/**
 * The dialog on a wide screen: a column on the left with the release, its contents and the way to
 * GitHub, the notes on the right. The column is there for every release, so the version and date
 * always sit in the same place; the contents only when the notes have headings to list. The entry
 * for the section being read is marked as the reader scrolls.
 *
 * It draws its own close button, because Semi's sits in a header row across the whole width, and
 * puts it first in the markup: Semi focuses the first focusable element when the dialog opens, and
 * that should be the way out rather than the first contents entry.
 *
 * @param {Object} props
 * @param {import('../../services/news/newsSelection.js').NewsRelease} props.release
 * @param {React.ReactNode} props.header
 * @param {string} props.doneLabel
 * @param {() => void} props.onDone
 * @param {() => void} props.onClose
 * @returns {React.ReactElement}
 */
function ReleaseColumns({ release, header, doneLabel, onDone, onClose }) {
  const t = useTranslation();
  const hasContents = Array.isArray(release.outline) && release.outline.length > 0;
  const scrollRef = useRef(null);
  const [active, setActive] = useState(0);

  const headings = () => (scrollRef.current ? [...scrollRef.current.querySelectorAll(SECTION_HEADINGS)] : []);

  const handleScroll = () => {
    const container = scrollRef.current;
    const list = headings();
    if (container == null || list.length === 0) {
      return;
    }
    // The last sections are often too short to ever reach the top. At the bottom, the last one is
    // what is being read.
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
      setActive(list.length - 1);
      return;
    }
    let current = 0;
    list.forEach((heading, index) => {
      if (heading.offsetTop - container.scrollTop <= SECTION_OFFSET) {
        current = index;
      }
    });
    setActive(current);
  };

  const showSection = (index) => {
    const heading = headings()[index];
    if (heading != null) {
      scrollRef.current.scrollTo({ top: heading.offsetTop - SECTION_OFFSET, behavior: 'smooth' });
    }
  };

  return (
    <div className="news__contentsDialog">
      <Button
        className="news__close"
        theme="borderless"
        type="tertiary"
        icon={<IconClose />}
        aria-label={t('version.modalClose')}
        onClick={onClose}
      />
      <aside className="news__rail">
        {header}
        {hasContents && (
          <nav className="news__contents" aria-label={t('news.contents')}>
            <span className="news__contentsLabel" aria-hidden="true">
              {t('news.contents')}
            </span>
            {release.outline.map((section, index) => (
              <button
                key={index}
                type="button"
                className={index === active ? 'news__contentsItem news__contentsItem--active' : 'news__contentsItem'}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => showSection(index)}
              >
                <span className="news__contentsTitle">{section.title}</span>
                {section.items > 0 && <span className="news__contentsCount">{section.items}</span>}
              </button>
            ))}
          </nav>
        )}
        <GithubLink release={release} />
      </aside>
      <div className="news__main">
        <div className="news__scroll" ref={scrollRef} onScroll={handleScroll}>
          <NewsReleaseBody release={release} />
        </div>
        <div className="news__mainFooter">
          <Button theme="solid" type="primary" onClick={onDone}>
            {doneLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * A release's notes as a dialog, shared by the news after an upgrade and the notice that an update
 * is available, so both read the same.
 *
 * Two columns on a wide screen (see `ReleaseColumns`). A phone gets the notes as a sheet from the
 * bottom, where a narrow screen wants a dialog anyway.
 *
 * @param {Object} props
 * @param {boolean} [props.visible]
 * @param {import('../../services/news/newsSelection.js').NewsRelease} props.release
 * @param {string} props.eyebrow What happened with the release: installed, or available.
 * @param {string} [props.fromVersion] The version it is compared with, shown as "from → to".
 * @param {string} props.doneLabel The label of the button that closes it.
 * @param {() => void} props.onDone The button.
 * @param {() => void} props.onClose The close icon, the mask, Escape.
 * @returns {React.ReactElement}
 */
export function ReleaseNotesDialog({ visible = true, release, eyebrow, fromVersion, doneLabel, onDone, onClose }) {
  const screenWidth = useScreenWidth();
  const header = <ReleaseHeader release={release} eyebrow={eyebrow} fromVersion={fromVersion} />;
  const footer = <ReleaseActions release={release} doneLabel={doneLabel} onDone={onDone} />;

  if (screenWidth <= 768) {
    return (
      <SideSheet
        visible={visible}
        placement="bottom"
        height="90%"
        title={header}
        footer={footer}
        onCancel={onClose}
        className="news__sheet"
      >
        <NewsReleaseBody release={release} />
      </SideSheet>
    );
  }

  return (
    <Modal className="news__modal" header={null} footer={null} visible={visible} width={960} onCancel={onClose}>
      <ReleaseColumns release={release} header={header} doneLabel={doneLabel} onDone={onDone} onClose={onClose} />
    </Modal>
  );
}

ReleaseNotesDialog.displayName = 'ReleaseNotesDialog';
