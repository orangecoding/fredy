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

  const openPicker = () => fileInputRef.current?.click();

  /**
   * Upload everything that was picked, one request per file, stopping at the first refusal.
   *
   * Sequential rather than parallel on purpose: the per-listing ceiling is checked server side per
   * request, so firing five at once past a limit of four would let all five through.
   *
   * @param {Event} event
   */
  const handleFiles = async (event) => {
    const files = Array.from(event.target.files ?? []);
    // Cleared immediately so picking the same file twice in a row still fires a change event.
    event.target.value = '';
    if (files.length === 0) return;

    setBusy(true);
    try {
      for (const file of files) {
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
      }
      Toast.success(t('listing.detail.attachmentsUploaded'));
    } catch (error) {
      Toast.error(error.message || t('listing.detail.attachmentsUploadError'));
    } finally {
      setBusy(false);
      await reload();
    }
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

  const atCapacity = limits != null && attachments.length >= limits.maxCount;

  return (
    <div className="attachmentsCard">
      <Title heading={4} className="attachmentsCard__title">
        {t('listing.detail.attachmentsTitle')}
      </Title>
      <Text type="tertiary" size="small" className="attachmentsCard__hint">
        {t('listing.detail.attachmentsHint')}
      </Text>

      {loading ? (
        <Spin />
      ) : (
        <ul className="attachmentsCard__list">
          {attachments.length === 0 && (
            <li className="attachmentsCard__empty">
              <Text type="tertiary">{t('listing.detail.attachmentsEmpty')}</Text>
            </li>
          )}
          {attachments.map((attachment) => (
            <li key={attachment.id} className="attachmentsCard__item">
              <a
                href={attachmentUrl(listingId, attachment.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="attachmentsCard__link"
              >
                {PREVIEWABLE.has(attachment.mimeType) ? (
                  <img
                    src={attachmentUrl(listingId, attachment.id)}
                    alt={attachment.filename}
                    className="attachmentsCard__thumb"
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

      <input
        type="file"
        multiple
        accept={ACCEPT}
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFiles}
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
