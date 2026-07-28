/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui-19';
import { transform } from '../../../../../services/transformer/providerTransformer';
import { useSelector } from '../../../../../services/state/store';

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

/**
 * Normalizes a url to its bare host, so that protocol (http/https) and a leading `www.` do not
 * cause a false negative when comparing the user's input against the provider's base url.
 */
const normalizeHost = (url) => {
  if (url == null) {
    return null;
  }
  const trimmed = String(url).trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
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
  const [providerUrl, setProviderUrl] = useState(null);
  const [validationMessage, setValidationMessage] = useState(null);

  useEffect(() => {
    if (providerToEdit) {
      setSelectedProvider(returnOriginalSelectedProvider(providerToEdit, provider));
      setProviderUrl(providerToEdit.url);
    } else {
      setSelectedProvider(null);
      setProviderUrl(null);
    }
  }, [providerToEdit, visible]);

  const width = useScreenWidth();
  const isMobile = width <= 850;

  const validate = () => {
    if (selectedProvider == null || selectedProvider.length === 0 || providerUrl == null || providerUrl.length === 0) {
      return t('provider.validationSelectAndUrl');
    }
    const inputHost = normalizeHost(providerUrl);
    const baseHost = normalizeHost(selectedProvider.baseUrl);
    if (inputHost == null || baseHost == null || inputHost !== baseHost) {
      return t('provider.validationInvalidUrl');
    }
    return null;
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
        setProviderUrl(null);
        setSelectedProvider(null);
        onVisibilityChanged(false);
      } else {
        setValidationMessage(validationResult);
      }
    } else {
      setProviderUrl(null);
      setSelectedProvider(null);
      onVisibilityChanged(false);
    }
  };

  return (
    <Modal
      title={providerToEdit ? t('provider.editTitle') : t('provider.defaultTitle')}
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      style={{ width: isMobile ? '95%' : '50rem' }}
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
        <>
          <p>{t('provider.description')}</p>
          <p>{t('provider.descriptionStep2')}</p>
        </>
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
        style={{ width: 180 }}
        value={selectedProvider == null ? '' : selectedProvider.id}
        onChange={(value) => {
          const selectedProvider = provider.find((pro) => pro.id === value);
          setSelectedProvider(selectedProvider);
          window.open(selectedProvider.baseUrl);
        }}
      />
      <br />
      <br />
      <Input
        type="text"
        placeholder={t('provider.urlPlaceholder')}
        width={10}
        className="providerMutator__fields"
        value={providerUrl}
        onInput={(e) => {
          setProviderUrl(e.target.value);
        }}
      />
    </Modal>
  );
}
