import React, { useState } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui';
import { useSelector } from 'react-redux';
import { IconLikeHeart } from '@douyinfe/semi-icons';
import './ProviderMutator.less';
import { Provider, RootState } from 'ui/src/types';

const sortProvider = (a: { value: string; label: string }, b: { value: string; label: string }) => {
  if (a.value < b.value) return -1;
  if (a.value > b.value) return 1;
  return 0;
};

export default function ProviderMutator({
  onVisibilityChanged,
  visible = false,
  onData,
}: {
  onVisibilityChanged?: (visible: boolean) => void;
  visible?: boolean;
  onData?: (data: Provider) => void;
} = {}) {
  const provider = useSelector((state: RootState) => state.provider.provider);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const validate = () => {
    if (selectedProvider == null || providerUrl == null || providerUrl.length === 0) {
      return 'Please select a provider and copy the browser url into the textfield after configuring your search parameter.';
    }
    try {
      const url = new URL(providerUrl);
      if (selectedProvider.baseUrl.indexOf(url.origin) === -1) {
        return 'The url you have copied is not valid.';
      }
    } catch (Exception) {
      console.error(Exception);
      return 'The url you have copied is not valid.';
    }
    return null;
  };

  const onSubmit = (doStore: boolean) => {
    if (doStore && selectedProvider && providerUrl && onData) {
      const validationResult = validate();
      if (validationResult == null) {
        const provider = structuredClone(selectedProvider);
        provider.url = providerUrl;
        onData(provider);
        setProviderUrl(null);
        setSelectedProvider(null);
        onVisibilityChanged?.(false);
      } else {
        setValidationMessage(validationResult);
      }
    } else {
      setProviderUrl(null);
      setSelectedProvider(null);
      onVisibilityChanged?.(false);
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
        Provider are the <IconLikeHeart style={{ color: '#ff0000' }} /> of Fredy. We&apos;re supporting multiple
        Provider such as Immowelt, Kalaydo etc. Select a provider from the list below.
        <br />
        Fredy will then open the provider&apos;s url in a new tab.
      </p>

      <p>
        You will need to configure your search parameter like you would do when you do a regular search on the
        provider&apos;s website.
        <br />
        When the search results are shown on the website, copy the url and paste it into the textfield below.
      </p>
      <Banner
        fullMode={false}
        type="warning"
        closeIcon={null}
        title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Warning</div>}
        style={{ marginBottom: '1rem' }}
        description={
          <div>
            <p>
              Immoscout will not work at the moment due to advanced bot detection. I&apos;m currently working on a fix.
            </p>
            <p>Until a fix has been released, Immoscout won&apos;t yield any results.</p>
          </div>
        }
      />
      <Select
        filter
        placeholder="Select a provider"
        className="providerMutator__fields"
        optionList={
          provider?.length > 0
            ? provider
                .map((pro: Provider) => {
                  return {
                    value: pro.id,
                    label: pro.name,
                  };
                })
                .sort(sortProvider)
            : []
        }
        style={{ width: 180 }}
        value={selectedProvider == null ? '' : selectedProvider.id}
        onChange={(value) => {
          const selectedProvider = provider.find((pro: Provider) => pro.id === value);
          setSelectedProvider(selectedProvider || null);
          window.open(selectedProvider?.baseUrl);
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
