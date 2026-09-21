/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, TextArea } from '@douyinfe/semi-ui-19';

import AttachmentsCard from './AttachmentsCard.jsx';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import './ListingWorkspace.less';

/**
 * The half of the page the reader writes rather than reads.
 *
 * Notes and uploaded documents are the two things a person adds to a listing, they are used in the
 * same sitting, and neither came from a portal - so they share a card instead of being two
 * unrelated blocks a divider apart. Both stay visible when empty: an upload area that only appears
 * once there is something to show cannot be the place you put the first thing.
 *
 * @param {Object} props
 * @param {string} props.listingId
 * @param {string} props.notesDraft
 * @param {(value: string) => void} props.onNotesChange
 * @param {() => void} props.onSaveNotes
 * @param {boolean} props.notesSaving
 * @param {boolean} props.notesDirty - Whether the draft differs from what is stored.
 * @returns {React.ReactElement}
 */
export default function ListingWorkspace({
  listingId,
  notesDraft,
  onNotesChange,
  onSaveNotes,
  notesSaving,
  notesDirty,
}) {
  const t = useTranslation();

  return (
    <section className="listing-card listing-workspace">
      <div className="listing-workspace__head">
        <h2 className="listing-card__label">{t('listing.detail.workspaceTitle')}</h2>
        {/* The retention rule, on the label line rather than as a paragraph under the upload
            control. It is a standing fact about the feature, read once, and it does not need to
            take a line of its own every time the page opens. */}
        <span className="listing-workspace__hint">{t('listing.detail.attachmentsRetention')}</span>
      </div>

      <div className="listing-workspace__columns">
        <div className="listing-workspace__notes">
          <h3 className="listing-workspace__subtitle">{t('listing.detail.notesTitle')}</h3>
          <TextArea
            value={notesDraft}
            onChange={onNotesChange}
            placeholder={t('listing.detail.notesPlaceholder')}
            rows={5}
            autosize={{ minRows: 6, maxRows: 14 }}
            className="listing-detail__notes-textarea"
            showClear
          />
        </div>

        <div className="listing-workspace__attachments">
          <AttachmentsCard listingId={listingId} />
        </div>
      </div>

      {/* Outlined, not solid: the page has exactly one solid button and it is not this one. */}
      <div className="listing-workspace__footer">
        <Button
          className="listing-workspace__save"
          theme="borderless"
          loading={notesSaving}
          disabled={notesSaving || !notesDirty}
          onClick={onSaveNotes}
        >
          {t('listing.detail.storeNotes')}
        </Button>
      </div>
    </section>
  );
}

ListingWorkspace.displayName = 'ListingWorkspace';
