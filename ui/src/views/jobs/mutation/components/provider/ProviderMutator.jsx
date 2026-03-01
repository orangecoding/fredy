/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui-19';
import { transform } from '../../../../../services/transformer/providerTransformer';
import { useSelector } from '../../../../../services/state/store';
import { IconLikeHeart } from '@douyinfe/semi-icons';
import './ProviderMutator.less';
import { useScreenWidth } from '../../../../../hooks/screenWidth.js';

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
      return 'Please select a provider and copy the browser url into the textfield after configuring your search parameter.';
    }
    try {
      const url = new URL(providerUrl);
      if (selectedProvider.baseUrl.indexOf(url.origin) === -1) {
        return 'The url you have copied is not valid.';
      }
      /* eslint-disable no-unused-vars */
    } catch (ignored) {
      return 'The url you have copied is not valid.';
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
      title={providerToEdit ? 'Editing an existing Provider' : 'Adding a new Provider'}
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      style={{ width: isMobile ? '95%' : '50rem' }}
      okText="Save"
    >
      {validationMessage != null && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Error</div>}
          style={{ marginBottom: '1rem' }}
          description={validationMessage}
        />
      )}
      {providerToEdit != null ? (
        <p>
          You can now edit the <strong>{providerToEdit.name}</strong> provider's URL in the input field below.
        </p>
      ) : (
        <>
          <p>
            Provider are the <IconLikeHeart style={{ color: '#ff0000' }} /> of Fredy. We're supporting multiple Provider
            such as Immowelt, Kalaydo etc. Select a provider from the list below.
            <br />
            Fredy will then open the provider's url in a new tab.
          </p>
          <p>
            You will need to configure your search parameter like you would do when you do a regular search on the
            provider's website.
            <br />
            When the search results are shown on the website, copy the url and paste it into the textfield below.
          </p>
        </>
      )}
      <Banner
        fullMode={false}
        type="warning"
        closeIcon={null}
        title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Warning</div>}
        style={{ marginBottom: '1rem' }}
        description={
          <div>
            <p>
              Currently, our Immoscout implementation does not support drawing shapes on a map. Use a radius instead.
            </p>
          </div>
        }
      />

      <Select
        filter
        placeholder="Select a provider"
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
        placeholder="Provider Url"
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
