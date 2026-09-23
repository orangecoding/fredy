/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Popconfirm, Spin, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconDelete, IconFile, IconUpload } from '@douyinfe/semi-icons';

import {
  attachmentUrl,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
} from '../../../services/attachmentsClient.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

import './AttachmentsCard.less';

const { Text, Title } = Typography;

/**
 * File types the picker offers. The backend decides for itself from the magic bytes; this only
 * spares the user a trip to the error message.
 * @type {string}
 */
const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/**
 * The same three types as a set, for the files that arrive by drop instead of through the picker.
 *
 * A drop ignores `accept` entirely - the file manager hands over whatever was dragged - so this is
 * where a dropped video is turned away before it is read and sent. Still a courtesy rather than a
 * guard: the decision that counts is the backend's, which reads the leading bytes.
 * @type {Set<string>}
 */
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

/**
 * The extensions matching those types, for files the OS handed over with no type at all.
 * @type {RegExp}
 */
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

/**
 * Types rendered as a thumbnail rather than as a file icon.
 * @type {Set<string>}
 */
const PREVIEWABLE = new Set(['image/jpeg', 'image/png']);

/**
 * A file size somebody can read at a glance.
 *
 * @param {number} bytes
 * @returns {string}
 */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Whether a file is worth sending at all.
 *
 * @param {File} file
 * @returns {boolean}
 */
function isAllowed(file) {
  if (file.type) {
    return ALLOWED_TYPES.has(file.type);
  }
  // Dragged out of an archive, or off an unusual file manager: no type, only a name.
  return ALLOWED_EXTENSIONS.test(file.name ?? '');
}

/**
 * Whether a drag carries files, as opposed to selected text or a link from another tab.
 *
 * @param {React.DragEvent} event
 * @returns {boolean}
 */
function dragHasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * The documents somebody attached to this listing: the exposé, the floor plan, the photos the agent
 * mailed over.
 *
 * It sits under the notes because it answers the same need. A portal deletes an ad the day the flat
 * is gone, and with it the floor plan and the specifications - which is precisely when somebody
 * comparing this year's prices against last year's wants to look at them. Keeping a copy here is
 * the only version that survives.
 *
 * Uploading also quietly rescues the listing from the retention purge, which is why the hint says
 * so. That is invisible otherwise, and it is half the reason to upload anything.
 *
 * Files arrive two ways and take the same path once they have: the picker behind the button, and a
 * drag onto the list, which is what people reach for first when the file is already sitting in a
 * folder next to the browser.
 *
 * Talks to the backend through `attachmentsClient` rather than the store: the bytes cannot travel
 * through `xhr.js`, and nothing outside this card needs to know about them.
 *
 * @param {Object} props
 * @param {string} props.listingId
 * @returns {React.ReactElement}
 */
export default function AttachmentsCard({ listingId }) {
  const t = useTranslation();
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** Whether a drag carrying files is currently over the list. */
  const [dragging, setDragging] = useState(false);

  const reload = useCallback(async () => {
    try {
      const payload = await listAttachments(listingId);
      setAttachments(payload.attachments ?? []);
      setLimits(payload.limits ?? null);
    } catch (error) {
      Toast.error(error.message || t('listing.detail.attachmentsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [listingId, t]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  /*
   * What the browser does with a file dropped anywhere else on the page: it navigates the tab to
   * it. Missing a box by a few pixels would take the page away and the half-written note beside it
   * with it, which is a steep price for aiming badly at a feature that only just appeared.
   *
   * Swallowed for as long as this card is on screen - file drags only. Text dragged into the notes
   * or an address field is a drop the browser handles itself, and cancelling every drop cancelled
   * that too. The zone's own handler has already run by the time this one does.
   */
  useEffect(() => {
    const swallow = (event) => {
      if (dragHasFiles(event)) event.preventDefault();
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  const openPicker = () => fileInputRef.current?.click();

  const atCapacity = limits != null && attachments.length >= limits.maxCount;
  const acceptsDrop = !busy && !atCapacity;

  /**
   * Upload everything handed over, one request per file, stopping at the first refusal.
   *
   * Sequential rather than parallel on purpose: the per-listing ceiling is checked server side per
   * request, so firing five at once past a limit of four would let all five through.
   *
   * @param {File[]} files
   */
  const uploadFiles = async (files) => {
    if (files.length === 0) return;

    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        if (!isAllowed(file)) {
          Toast.error(t('listing.detail.attachmentsWrongType', { name: file.name }));
          break;
        }
        if (limits && file.size > limits.maxBytes) {
          Toast.error(
            t('listing.detail.attachmentsTooLarge', {
              name: file.name,
              max: Math.round(limits.maxBytes / (1024 * 1024)),
            }),
          );
          break;
        }
        await uploadAttachment(listingId, file);
        uploaded += 1;
      }
      // Only when something actually went up. A first file refused before it was ever sent used to
      // be reported as a successful upload.
      if (uploaded > 0) {
        Toast.success(t('listing.detail.attachmentsUploaded'));
      }
    } catch (error) {
      Toast.error(error.message || t('listing.detail.attachmentsUploadError'));
    } finally {
      setBusy(false);
      await reload();
    }
  };

  /**
   * @param {React.ChangeEvent<HTMLInputElement>} event
   */
  const handlePicked = async (event) => {
    const files = Array.from(event.target.files ?? []);
    // Cleared immediately so picking the same file twice in a row still fires a change event.
    event.target.value = '';
    await uploadFiles(files);
  };

  /**
   * @param {React.DragEvent} event
   */
  const handleDragEnter = (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  };

  /**
   * @param {React.DragEvent} event
   */
  const handleDragOver = (event) => {
    if (!dragHasFiles(event)) return;
    // Without this the browser refuses the drop and navigates to the file instead, losing the page.
    event.preventDefault();
    event.dataTransfer.dropEffect = acceptsDrop ? 'copy' : 'none';
  };

  /**
   * @param {React.DragEvent} event
   */
  const handleDragLeave = (event) => {
    // Crossing from one child of the zone to the next fires a leave on the way out of each of them.
    // Only a target outside the zone means the pointer has really left it.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDragging(false);
  };

  /**
   * @param {React.DragEvent} event
   */
  const handleDrop = async (event) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    if (atCapacity) {
      Toast.error(t('listing.detail.attachmentsFull', { max: limits.maxCount }));
      return;
    }
    await uploadFiles(Array.from(event.dataTransfer.files ?? []));
  };

  /**
   * @param {string} attachmentId
   */
  const handleDelete = async (attachmentId) => {
    setBusy(true);
    try {
      await deleteAttachment(listingId, attachmentId);
      Toast.success(t('listing.detail.attachmentsDeleted'));
    } catch (error) {
      Toast.error(error.message || t('listing.detail.attachmentsDeleteError'));
    } finally {
      setBusy(false);
      await reload();
    }
  };

  return (
    <div className="attachmentsCard">
      <Title heading={4} className="attachmentsCard__title">
        {t('listing.detail.attachmentsTitle')}
      </Title>
      <Text type="tertiary" size="small" className="attachmentsCard__hint">
        {t('listing.detail.attachmentsHint')}
      </Text>

      {/* The drop target is the list rather than the whole card, so it is the same box that shows
          what is already attached - and it stays a target once there is something in it. */}
      <div
        className={`attachmentsCard__dropzone${dragging ? ' attachmentsCard__dropzone--active' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading ? (
          <Spin />
        ) : (
          <ul className="attachmentsCard__list">
            {attachments.length === 0 && (
              <li className="attachmentsCard__empty">
                <Text type="tertiary">{t('listing.detail.attachmentsEmpty')}</Text>
                <Text type="tertiary" size="small" className="attachmentsCard__emptyHint">
                  {t('listing.detail.attachmentsDropHint')}
                </Text>
              </li>
            )}
            {attachments.map((attachment) => (
              <li key={attachment.id} className="attachmentsCard__item">
                {/* Not draggable: the list is the drop zone, and a thumbnail nudged a few pixels
                    and let go over it arrived as a file drop - a second copy of the document. */}
                <a
                  href={attachmentUrl(listingId, attachment.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachmentsCard__link"
                  draggable={false}
                >
                  {PREVIEWABLE.has(attachment.mimeType) ? (
                    <img
                      src={attachmentUrl(listingId, attachment.id)}
                      alt={attachment.filename}
                      className="attachmentsCard__thumb"
                      draggable={false}
                    />
                  ) : (
                    <span className="attachmentsCard__thumb attachmentsCard__thumb--icon">
                      <IconFile />
                    </span>
                  )}
                  <span className="attachmentsCard__meta">
                    <span className="attachmentsCard__name">{attachment.filename}</span>
                    <Text type="tertiary" size="small">
                      {humanSize(attachment.size)}
                    </Text>
                  </span>
                </a>
                <Popconfirm
                  title={t('listing.detail.attachmentsDeleteTitle')}
                  content={t('listing.detail.attachmentsDeleteConfirm')}
                  onConfirm={() => handleDelete(attachment.id)}
                >
                  <Button icon={<IconDelete />} theme="borderless" type="danger" disabled={busy} />
                </Popconfirm>
              </li>
            ))}
          </ul>
        )}

        {/* Covers the list while a drag is over it, so the answer to "will this land here" is the
            box itself rather than the cursor. Never takes the pointer - see the stylesheet. */}
        {dragging && (
          <div className="attachmentsCard__dropOverlay" aria-hidden="true">
            <IconUpload />
            <span>
              {acceptsDrop
                ? t('listing.detail.attachmentsDropActive')
                : atCapacity
                  ? t('listing.detail.attachmentsFull', { max: limits?.maxCount })
                  : // Refused because an upload or a delete is still running, which is not the
                    // listing being full.
                    t('listing.detail.attachmentsBusy')}
            </span>
          </div>
        )}
      </div>

      <input
        type="file"
        multiple
        accept={ACCEPT}
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handlePicked}
      />
      <Button
        icon={<IconUpload />}
        onClick={openPicker}
        loading={busy}
        disabled={busy || atCapacity}
        theme="light"
        type="primary"
      >
        {t('listing.detail.attachmentsUpload')}
      </Button>
      {atCapacity && (
        <Text type="warning" size="small" className="attachmentsCard__capacity">
          {t('listing.detail.attachmentsFull', { max: limits.maxCount })}
        </Text>
      )}
    </div>
  );
}
