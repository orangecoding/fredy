/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui-19';
import { IconExternalOpen } from '@douyinfe/semi-icons';
import { transform } from '../../../../../services/transformer/providerTransformer';
import { useSelector } from '../../../../../services/state/store';
import { validateProviderUrl } from '../../../../../services/jobs/providerUrl.js';

import './ProviderMutator.less';
import { useScreenWidth } from '../../../../../hooks/screenWidth.js';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';

const sortProvider = (a, b) => {
  if (a.key < b.key) {
    return -1;
  }
  if (a.key > b.key) {
    return 1;
  }
  return 0;
};

const returnOriginalSelectedProvider = (providerToEdit, provider) => {
  return provider.find((pro) => pro.id === providerToEdit.id);
};

export default function ProviderMutator({
  onVisibilityChanged,
  visible = false,
  onData,
  onEditData,
  providerToEdit,
} = {}) {
  const t = useTranslation();
  const provider = useSelector((state) => state.provider);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerUrl, setProviderUrl] = useState('');
  const [validationMessage, setValidationMessage] = useState(null);

  useEffect(() => {
    // The message is cleared along with the fields. It used to be left behind, so tripping the
    // error once meant a stale red banner greeted the next "Add new Provider".
    setValidationMessage(null);
    if (providerToEdit) {
      setSelectedProvider(returnOriginalSelectedProvider(providerToEdit, provider));
      setProviderUrl(providerToEdit.url ?? '');
    } else {
      setSelectedProvider(null);
      setProviderUrl('');
    }
  }, [providerToEdit, visible]);

  const width = useScreenWidth();
  const isMobile = width <= 850;

  /**
   * Why the pasted URL cannot be used, in words the user can act on.
   *
   * @returns {string|null}
   */
  const validate = () => {
    const { ok, problem, expectedHost } = validateProviderUrl(providerUrl, selectedProvider);
    if (ok) {
      return null;
    }
    switch (problem) {
      case 'bareHost':
        return t('provider.validationBareHost', { host: expectedHost });
      case 'wrongHost':
        return t('provider.validationWrongHost', { host: expectedHost });
      case 'unparsable':
        return t('provider.validationUnparsable');
      default:
        return t('provider.validationSelectAndUrl');
    }
  };

  const onSubmit = (doStore) => {
    if (doStore) {
      const validationResult = validate();
      if (validationResult == null) {
        if (providerToEdit != null) {
          onEditData({
            newData: transform({
              url: providerUrl,
              id: selectedProvider.id,
              name: selectedProvider.name,
            }),
            oldProviderToEdit: providerToEdit,
          });
        } else {
          onData(
            transform({
              url: providerUrl,
              id: selectedProvider.id,
              name: selectedProvider.name,
            }),
          );
        }
        setProviderUrl('');
        setSelectedProvider(null);
        setValidationMessage(null);
        onVisibilityChanged(false);
      } else {
        setValidationMessage(validationResult);
      }
    } else {
      setProviderUrl('');
      setSelectedProvider(null);
      setValidationMessage(null);
      onVisibilityChanged(false);
    }
  };

  return (
    <Modal
      title={providerToEdit ? t('provider.editTitle') : t('provider.defaultTitle')}
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      // Three short lines and two fields do not need half a screen. It was 50rem, which left the
      // controls stranded in the left third of an otherwise empty dialog.
      style={{ width: isMobile ? '95%' : '34rem' }}
      okText={t('provider.save')}
    >
      {validationMessage != null && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          title={
            <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>{t('provider.errorTitle')}</div>
          }
          style={{ marginBottom: '1rem' }}
          description={validationMessage}
        />
      )}
      {providerToEdit != null ? (
        <p>{t('provider.editDescription', { name: providerToEdit.name })}</p>
      ) : (
        // Three numbered steps, where there used to be the same instruction written out three
        // times: once as the section's help text, and twice more as paragraphs here.
        <ol className="providerMutator__steps">
          <li>{t('provider.step1')}</li>
          <li>{t('provider.step2')}</li>
          <li>{t('provider.step3')}</li>
        </ol>
      )}
      <Select
        filter
        placeholder={t('provider.selectPlaceholder')}
        className="providerMutator__fields"
        disabled={providerToEdit != null}
        optionList={provider
          .map((pro) => {
            return {
              otherKey: pro.id,
              value: pro.id,
              label: pro.name,
            };
          })
          .sort(sortProvider)}
        style={{ width: '100%' }}
        value={selectedProvider == null ? '' : selectedProvider.id}
        onChange={(value) => {
          setSelectedProvider(provider.find((pro) => pro.id === value));
          setValidationMessage(null);
        }}
      />

      {/* A link the user clicks, rather than a window.open() fired from the Select's onChange. That
          opened a tab before they had read a word of the instructions, opened a second one if they
          changed their mind about the portal, and was swallowed without a trace by a popup
          blocker. */}
      {selectedProvider != null && (
        <a
          className="providerMutator__openLink"
          href={selectedProvider.baseUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          <IconExternalOpen />
          {t('provider.openInNewTab', { name: selectedProvider.name })}
        </a>
      )}

      <Input
        type="text"
        placeholder={t('provider.urlPlaceholder')}
        width={10}
        className="providerMutator__fields providerMutator__url"
        value={providerUrl}
        onChange={(value) => {
          setProviderUrl(value);
          setValidationMessage(null);
        }}
      />
    </Modal>
  );
}
