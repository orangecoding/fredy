// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React, { useState } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui';
import { transform } from '../../../../../services/transformer/providerTransformer';
import { useSelector } from 'react-redux';
import { IconLikeHeart } from '@douyinfe/semi-icons';
import './ProviderMutator.less';

const sortProvider = (a: any, b: any) => {
  if (a.key < b.key) {
    return -1;
  }
  if (a.key > b.key) {
    return 1;
  }
  return 0;
};

export default function ProviderMutator({
  onVisibilityChanged,
  visible = false,
  onData
}: any = {}) {
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
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

  const onSubmit = (doStore: any) => {
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
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Modal
      title="Adding a new Provider"
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      style={{ width: '50rem' }}
      okText="Save"
    >
      {validationMessage != null && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Error</div>}
          style={{ marginBottom: '1rem' }}
          description={validationMessage}
        />
      )}

      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <p>
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        Provider are the <IconLikeHeart style={{ color: '#ff0000' }} /> of Fredy. We're supporting multiple Provider
        such as Immowelt, Kalaydo etc. Select a provider from the list below.
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <br />
        Fredy will then open the provider's url in a new tab.
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      </p>
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <p>
        You will need to configure your search parameter like you would do when you do a regular search on the
        provider's website.
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <br />
        When the search results are shown on the website, copy the url and paste it into the textfield below.
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      </p>
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Banner
        fullMode={false}
        type="warning"
        closeIcon={null}
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Warning</div>}
        style={{ marginBottom: '1rem' }}
        description={
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          <div>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>
              Immoscout will not work at the moment due to advanced bot detection. I'm currently working on a fix.
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            </p>
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            <p>
              Until a fix has been released, Immoscout won't yield any results.
            // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
            </p>
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          </div>
        }
      />

      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Select
        filter
        placeholder="Select a provider"
        className="providerMutator__fields"
        optionList={provider
          .map((pro: any) => {
            return {
              otherKey: pro.id,
              value: pro.id,
              label: pro.name,
            };
          })
          .sort(sortProvider)}
        style={{ width: 180 }}
        value={selectedProvider == null ? '' : selectedProvider.id}
        onChange={(value: any) => {
          const selectedProvider = provider.find((pro: any) => pro.id === value);
          setSelectedProvider(selectedProvider);

          window.open(selectedProvider.baseUrl);
        }}
      />
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <br />
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <br />
      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Input
        type="text"
        placeholder="Provider Url"
        width={10}
        className="providerMutator__fields"
        onBlur={(e: any) => {
          setProviderUrl(e.target.value);
        }}
      />
    </Modal>
  );
}
