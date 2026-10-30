/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Dropdown, Spin, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconArticle, IconFilter, IconRefresh } from '@douyinfe/semi-icons';

import { useTranslation } from '../../../services/i18n/i18n.jsx';
import { useActions } from '../../../services/state/store.js';
import { errorMessage } from '../../../services/xhr.js';
import './ListingDescriptionCard.less';

const { Text } = Typography;

/** Where the action sits inside the hint sentence. Each locale places it by its own grammar. */
const ACTION_SLOT = '{{action}}';

/**
 * What the card says about the last fetch, per outcome.
 *
 * `updated` is missing on purpose: when it worked, the text itself is the answer, and a line saying
 * so would be the page congratulating itself under the thing the reader asked for.
 *
 * @type {Record<string, {key: string, tone: string}>}
 */
const OUTCOME = {
  unsupported: { key: 'listing.detail.refetchUnsupported', tone: 'muted' },
  unchanged: { key: 'listing.detail.refetchUnchanged', tone: 'muted' },
  failed: { key: 'listing.detail.refetchFailed', tone: 'error' },
  busy: { key: 'listing.detail.refetchBusy', tone: 'muted' },
};

/**
 * The portal's own words about the flat, and a way to go and get them.
 *
 * An empty description is the normal case on some portals rather than the exception, because the
 * search page a listing is scraped from carries a headline and little else. The detail page has the
 * text, and Fredy can read it - but in the bulk sweep only for the portals ticked in settings, and
 * only at the moment a listing was found. This card offers the same fetch by hand, for this one
 * listing: one person asking for one exposé is not the traffic that setting is there to hold back.
 *
 * In the empty state the verb in the sentence IS the control, rather than a button next to a
 * sentence describing what the button would do. There is only one thing to do here and saying it
 * twice is one time too many.
 *
 * The outcome stays on the card rather than passing by as a toast. "This portal has no detail page"
 * is a standing fact about the listing, not an event, and a reader who missed the toast would
 * otherwise press again to find out what happened.
 *
 * @param {Object} props
 * @param {Object} props.listing
 * @param {() => void} props.onRefetch
 * @param {boolean} props.refetching - Whether a fetch is in flight.
 * @param {string|null} props.outcome - The last status the route answered with, or null.
 * @returns {React.ReactElement}
 */
export default function ListingDescriptionCard({ listing, onRefetch, refetching, outcome }) {
  const t = useTranslation();
  const actions = useActions();
  const description = listing?.description;
  const jobId = listing?.job_id;
  const jobName = listing?.job_name;
  const note = outcome ? OUTCOME[outcome] : null;
  // A portal with no detail page will not grow one on a second press.
  const exhausted = outcome === 'unsupported';

  const [selectedText, setSelectedText] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ x: 0, y: 0 });

  const anchorRef = useRef(null);

  const closeMenu = useCallback(() => {
    setMenuVisible(false);
  }, []);

  useEffect(() => {
    if (!menuVisible) return;
    const handleDocumentClick = (e) => {
      if (anchorRef.current && anchorRef.current.contains(e.target)) return;
      closeMenu();
    };
    const handleScroll = () => closeMenu();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('click', handleDocumentClick);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('click', handleDocumentClick);
    };
  }, [menuVisible, closeMenu]);

  const handleContextMenu = (e) => {
    const selection = window.getSelection()?.toString().trim();
    if (!selection || !jobId) {
      return;
    }

    e.preventDefault();
    setSelectedText(selection);
    setMenuCoords({
      x: e.clientX,
      y: e.clientY,
    });
    setMenuVisible(true);
  };

  const handleAddToBlacklist = async () => {
    if (!jobId || !selectedText) return;
    closeMenu();
    const term = selectedText;

    try {
      const result = await actions.jobsData.addJobBlacklistWord(jobId, term);
      if (result && Array.isArray(result.added) && result.added.length > 0) {
        Toast.success(
          t('listing.detail.blacklistAdded', {
            term,
            job: jobName || jobId,
          }),
        );
      } else {
        Toast.info(
          t('listing.detail.blacklistAlreadyPresent', {
            term,
          }),
        );
      }
    } catch (err) {
      Toast.error(errorMessage(err, t('listing.detail.blacklistError')));
    }
  };

  const menu = (
    <Dropdown.Menu className="listing-description-menu">
      <Dropdown.Item icon={<IconFilter />} onClick={handleAddToBlacklist}>
        {t('listing.detail.addToBlacklist', { term: selectedText })}
      </Dropdown.Item>
    </Dropdown.Menu>
  );
  // Read without variables, so the placeholder survives to be split on. The two halves are whatever
  // the locale wrote around it, which is the only way a German verb at the end and an English one
  // in the middle can share a single string.
  const [before, after] = t('listing.detail.refetchHint').split(ACTION_SLOT);

  return (
    <section className="listing-card listing-description" onContextMenu={handleContextMenu}>
      <div className="listing-description__head">
        <h2 className="listing-card__label">{t('listing.detail.descriptionTitle')}</h2>
        {/* Only when there is already text: the empty state acts through its own sentence, and a
            second control in the corner would be the same action offered twice. */}
        {description && (
          <Button
            className="listing-description__refetch"
            icon={<IconRefresh />}
            theme="outline"
            size="small"
            loading={refetching}
            disabled={refetching || exhausted}
            onClick={onRefetch}
          >
            {t('listing.detail.refetchAgain')}
          </Button>
        )}
      </div>

      {description ? (
        <p className="listing-description__body">{description}</p>
      ) : (
        <div className="listing-description__empty">
          <IconArticle className="listing-description__empty-icon" aria-hidden="true" />
          <div className="listing-description__empty-body">
            <span className="listing-description__empty-lead">{t('listing.detail.noDescription')}</span>
            <Text type="tertiary" size="small">
              {before}
              {/* A button, not an anchor: it acts on this page and goes nowhere, so it has to be
                  the element a keyboard and a screen reader treat as an action. */}
              <button
                type="button"
                className="listing-description__action"
                disabled={refetching || exhausted}
                onClick={onRefetch}
              >
                {t('listing.detail.refetchHintAction')}
              </button>
              {after}
              {refetching && <Spin size="small" className="listing-description__spinner" />}
            </Text>
            {listing?.link && (
              <a href={listing.link} target="_blank" rel="noopener noreferrer" className="listing-description__link">
                {t('listing.detail.noDescriptionLink')}
              </a>
            )}
          </div>
        </div>
      )}

      {note && (
        <p className={`listing-description__outcome listing-description__outcome--${note.tone}`}>{t(note.key)}</p>
      )}
      <Dropdown
        trigger="custom"
        visible={menuVisible}
        onVisibleChange={setMenuVisible}
        position="bottomLeft"
        render={menu}
        stopPropagation
      >
        <span
          ref={anchorRef}
          style={{
            position: 'fixed',
            left: `${menuCoords.x}px`,
            top: `${menuCoords.y}px`,
            width: '1px',
            height: '1px',
            pointerEvents: 'none',
            visibility: 'hidden',
          }}
        />
      </Dropdown>
    </section>
  );
}

ListingDescriptionCard.displayName = 'ListingDescriptionCard';
