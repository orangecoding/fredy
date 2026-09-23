/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState } from 'react';

import './FredyFooter.less';
import { useSelector } from '../../services/state/store.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';
import VersionModal from '../version/VersionModal.jsx';

/**
 * The heart in front of the credit: the one from the Fredy logo.
 *
 * It used to be an emoji inside the translated string, which followed no theme, rendered
 * differently on every platform and was the only one of its kind in the application.
 *
 * The outline is traced from the brush heart in `assets/logo.png`, so the mark beside the credit is
 * the mark on the wordmark rather than a second, geometric heart that merely also reads as one. The
 * two counters are the gaps the brush left; `fill-rule="evenodd"` is what punches them out. They
 * are invisible at this size and carry the drawing at any larger one.
 *
 * Size and colour come from the stylesheet, so neither sits in the markup.
 *
 * @returns {React.ReactElement}
 */
function Heart() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className="fredyFooter__heart">
      <path d="M17.27 0L18.34 0L19.64 0.3L20.71 0.95L21.3 1.6L21.66 2.25L21.96 3.5L21.96 4.68L21.78 5.81L20.59 9.42L18.52 13.57L14.9 19.44L12.65 23.64L12.12 24L11.47 24L11.11 23.82L10.7 23.29L10.64 22.87L10.81 22.4L8.74 20.03L6.67 17.13L5.19 14.64L3.88 12.09L2.81 9.42L2.22 7.17L2.04 5.63L2.22 3.32L2.81 1.84L3.59 0.89L4.41 0.47L5.48 0.59L6.19 0.95L7.02 1.6L8.74 3.44L10.04 5.33L11.11 7.7L12.12 4.56L12.71 3.32L13.42 2.25L14.25 1.36L15.08 0.77L15.91 0.36ZM18.52 2.25L18.46 2.96L17.51 5.39L16.27 9.54L18.58 6.22L19.11 5.69L19.59 5.63L19.64 5.45L19.82 4.39L19.7 3.26L19.29 2.61ZM4.3 5.33L4.3 6.4L4.65 8L5.72 10.9L7.97 15.11L10.22 18.31L6.61 11.26L5.13 7.76Z" />
    </svg>
  );
}

Heart.displayName = 'Heart';

/**
 * The tick that says the version standing next to it is the current one.
 *
 * @returns {React.ReactElement}
 */
function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="fredyFooter__stateIcon">
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

Tick.displayName = 'Tick';

/**
 * The bar along the bottom: which version this is, and who wrote it.
 *
 * The version number used to stand here on its own, which left the one question it gets looked up
 * for unanswered. It now says whether it is current, and when it is not, it is the control that
 * opens the release notes - a job a warning banner used to do from the top of every page.
 *
 * @returns {React.ReactElement}
 */
export default function FredyFooter() {
  const t = useTranslation();
  const [notesVisible, setNotesVisible] = useState(false);
  const versionUpdate = useSelector((state) => state.versionUpdate.versionUpdate);
  const hasUpdate = Boolean(versionUpdate?.newVersion);
  // Only when GitHub actually answered. `newVersion: false` alone is also what an install that
  // cannot reach GitHub (or is rate-limited) gets, and the answer is not in before the request is.
  const upToDate = !hasUpdate && versionUpdate?.checked === true;

  return (
    <footer className="fredyFooter" aria-label={t('footer.landmark')}>
      <div className="fredyFooter__left">
        <span className="fredyFooter__version">Fredy v{versionUpdate?.localFredyVersion || t('common.na')}</span>
        {hasUpdate && (
          <button type="button" className="fredyFooter__update" onClick={() => setNotesVisible(true)}>
            <span className="fredyFooter__updateDot" />
            {t('version.updateChip', { version: versionUpdate.version })}
          </button>
        )}
        {upToDate && (
          <span className="fredyFooter__state">
            <Tick />
            {t('version.upToDate')}
          </span>
        )}
      </div>
      <span className="fredyFooter__credit">
        <Heart />
        <span>
          {t('footer.madeBy')}{' '}
          <a href="https://github.com/orangecoding" target="_blank" rel="noreferrer">
            Christian Kellner
          </a>
        </span>
      </span>
      {hasUpdate && <VersionModal visible={notesVisible} onClose={() => setNotesVisible(false)} />}
    </footer>
  );
}
