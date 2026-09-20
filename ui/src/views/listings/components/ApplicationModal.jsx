/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal, Button, Space, Spin, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconCopy } from '@douyinfe/semi-icons';
import { useTranslation } from '../../../services/i18n/i18n.jsx';
import { errorMessage } from '../../../services/xhr.js';
import { fetchApplicationLetter } from '../../../services/applicationClient.js';
import { copyToClipboard } from '../../../services/clipboard.js';
import { LETTER_LANGUAGE_FLAG, PLACEHOLDER_CATALOG } from '../../../services/application/placeholderCatalog.js';
import './ApplicationModal.less';

const { Text, Paragraph } = Typography;

/**
 * The copy dialog behind every "Bewerbung kopieren" button.
 *
 * The letter is fetched when the dialog opens and copied on a later click, which is what keeps the
 * clipboard write inside its own user gesture - Safari drops the transient activation across an
 * await, so fetching and copying in one click would be refused.
 *
 * Edits made here are deliberately not saved back into the template. Sentences written for one flat
 * are the last thing anybody wants in the letter they send to the next one; the template editor is
 * one click away under Settings.
 *
 * @param {Object} props
 * @param {boolean} props.visible
 * @param {string|null} props.listingId
 * @param {() => void} props.onCancel
 * @returns {React.ReactElement}
 */
export default function ApplicationModal({ visible, listingId, onCancel }) {
  const t = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [letter, setLetter] = useState(null);
  const [text, setText] = useState('');
  /**
   * Which request the state on screen belongs to.
   *
   * One dialog instance serves the whole listings page, so two letters can be in flight across a
   * close and a reopen. Without this, a slow answer for the listing the user has already left
   * lands in the dialog they opened next - and nothing on screen names the listing, so the letter
   * they copy is for a flat they did not pick.
   */
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!listingId) return;
    const token = request.current + 1;
    request.current = token;

    setLoading(true);
    setError(null);
    // The previous listing's letter goes before the next one is asked for. Leaving it would show
    // it for a frame on reopen, and - if the new request fails - leave Copy enabled over it.
    setLetter(null);
    setText('');

    try {
      const result = await fetchApplicationLetter(listingId);
      if (token !== request.current) return;
      setLetter(result);
      setText(result.text);
    } catch (exception) {
      if (token !== request.current) return;
      console.error('Error while trying to draft an application letter.', exception);
      // xhr.js rejects with {status, json} and no `.message`, so reading one loses every backend
      // error text; errorMessage is what unwraps both shapes.
      setError(errorMessage(exception, t('listing.application.loadError')));
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [listingId, t]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleCopy = async () => {
    const copied = await copyToClipboard(text);
    if (!copied) {
      Toast.error(t('listing.application.copyError'));
      return;
    }
    Toast.success(t('listing.application.copied'));
    onCancel();
  };

  const openSettings = () => {
    onCancel();
    navigate('/settings/application');
  };

  const languageLabel = letter == null ? '' : t(`application.language.${letter.language}`);

  const footer = (
    <div className="applicationModal__footer">
      <Button onClick={onCancel}>{t('listing.application.close')}</Button>
      <Button
        theme="solid"
        type="primary"
        icon={<IconCopy />}
        disabled={loading || text.length === 0}
        onClick={handleCopy}
      >
        {t('listing.application.copy')}
      </Button>
    </div>
  );

  return (
    <Modal
      title={t('listing.application.title')}
      visible={visible}
      onCancel={onCancel}
      footer={footer}
      width={720}
      className="applicationModal"
    >
      {loading && (
        <div className="applicationModal__loading">
          <Spin size="large" />
        </div>
      )}

      {!loading && error != null && (
        <div className="applicationModal__error">
          <Text type="danger">{error}</Text>
          <Button onClick={load}>{t('listing.application.retry')}</Button>
        </div>
      )}

      {!loading && error == null && letter != null && (
        <>
          <Space wrap className="applicationModal__meta">
            <Tag size="large" color="blue">
              {LETTER_LANGUAGE_FLAG[letter.language] ?? ''} {languageLabel}
            </Tag>
            <Text type="tertiary">{t('listing.application.languageReason', { provider: letter.providerName })}</Text>
          </Space>

          {/* Semi puts className on the wrapper, not on the textarea, so the letter's own type
              has to be set through textareaStyle or it silently keeps the form default. */}
          <TextArea
            value={text}
            onChange={setText}
            autosize={{ minRows: 14, maxRows: 24 }}
            className="applicationModal__text"
            textareaStyle={{ fontSize: 14, lineHeight: 1.55 }}
            aria-label={t('listing.application.title')}
          />

          {/* Edits here are for this one letter. Saying so is cheaper than a surprise later. */}
          <Paragraph type="tertiary" size="small" className="applicationModal__hint">
            {t('listing.application.editHint')}
          </Paragraph>

          {!letter.hasProfile && (
            <div className="applicationModal__callout">
              <Text>{t('listing.application.noProfile')}</Text>
              <Button theme="borderless" type="primary" onClick={openSettings}>
                {t('listing.application.openProfile')}
              </Button>
            </div>
          )}

          {letter.hasProfile && letter.missing.length > 0 && (
            <div className="applicationModal__missing">
              <Text type="tertiary">{t('listing.application.missingTitle')}</Text>
              <Space wrap>
                {letter.missing.map((key) => (
                  <Tag key={key} color="amber" onClick={openSettings} style={{ cursor: 'pointer' }}>
                    {PLACEHOLDER_CATALOG[key] ? t(PLACEHOLDER_CATALOG[key].labelKey) : key}
                  </Tag>
                ))}
              </Space>
            </div>
          )}

          {letter.unknown.length > 0 && (
            <Paragraph type="warning" size="small" className="applicationModal__hint">
              {t('listing.application.unknownPlaceholders', { placeholders: letter.unknown.join(', ') })}
            </Paragraph>
          )}
        </>
      )}
    </Modal>
  );
}

ApplicationModal.displayName = 'ApplicationModal';
