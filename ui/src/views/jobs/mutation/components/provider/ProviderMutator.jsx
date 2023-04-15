import React, { useState } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui';
import { transform } from '../../../../../services/transformer/providerTransformer';
import { useSelector } from 'react-redux';
import { IconLikeHeart } from '@douyinfe/semi-icons';
import './ProviderMutator.less';

const sortProvider = (a, b) => {
  if (a.key < b.key) {
    return -1;
  }
  if (a.key > b.key) {
    return 1;
  }
  return 0;
};

export default function ProviderMutator({ onVisibilityChanged, visible = false, onData } = {}) {
  const provider = useSelector((state) => state.provider);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerUrl, setProviderUrl] = useState(null);
  const [validationMessage, setValidationMessage] = useState(null);
  const validate = () => {
    if (selectedProvider == null || selectedProvider.length === 0 || providerUrl == null || providerUrl.length === 0) {
      return 'Please select a provider and copy the browser url into the textfield after configuring your search parameter.';
    }
    try {
      const url = new URL(providerUrl);
      if (selectedProvider.baseUrl.indexOf(url.origin) === -1) {
        return 'The url you have copied is not valid.';
      }
    } catch (Exception) {
      return 'The url you have copied is not valid.';
    }
    return null;
  };

  const onSubmit = (doStore) => {
    if (doStore) {
      const validationResult = validate();
      if (validationResult == null) {
        onData(
          transform({
            url: providerUrl,
            id: selectedProvider.id,
            name: selectedProvider.name,
          })
        );
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
      title="Adding a new Provider"
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      style={{ width: '50rem' }}
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
      <Banner
        fullMode={false}
        type="warning"
        closeIcon={null}
        title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>ScrapingAnt</div>}
        style={{ marginBottom: '1rem' }}
        description={
          <div>
            <p>
              If you chose Immoscout or Immonet as a provider, make sure to also add the scrapingAnt apiKey to the config.json.
              (See readme)
            </p>
            <p>
              Do not forget to sort the results by date before copying the url to Fredy, so that Fredy always captures
              the latest search results.
            </p>
          </div>
        }
      />

      <Select
        filter
        placeholder="Select a provider"
        className="providerMutator__fields"
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
        onBlur={(e) => {
          setProviderUrl(e.target.value);
        }}
      />
    </Modal>
  );
}
