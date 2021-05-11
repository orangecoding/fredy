import React, { useState } from 'react';

import { transform } from '../../../../../services/transformer/providerTransformer';
import { Modal, Icon, Button, Dropdown, Input, Message } from 'semantic-ui-react';
import { useSelector } from 'react-redux';

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

export default function ProviderMutator({ onVisibilityChanged, visible = false, selected = [], onData } = {}) {
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
    <Modal onClose={() => onVisibilityChanged(false)} onOpen={() => onVisibilityChanged(true)} open={visible}>
      <Modal.Header>Adding a new Provider</Modal.Header>
      <Modal.Content image>
        <Modal.Description>
          {validationMessage != null && (
            <Message negative>
              <Message.Header>Houston we have a problem...</Message.Header>
              <p>{validationMessage}</p>
            </Message>
          )}

          <p>
            Provider are the <Icon name="heart" color="red" /> of Fredy. We're supporting multiple Provider such as
            Immowelt, Kalaydo etc. Select a provider from the list below.
            <br />
            Fredy will then open the provider's url in a new tab.
          </p>
          <p>
            You will need to configure your search parameter like you would do when you do a regular search on the
            provider's website.
            <br />
            When the search results are shown on the website, copy the url and paste it into the textfield below.
            <br />
            <span style={{ color: '#ff0000' }}>
              If you chose Immoscout as a provider, make sure to also add the scrapingAnt apiKey to the config.json.
              (See readme)
            </span>
            <br />
            <span style={{ color: '#ff0000' }}>
              Do not forget to sort the results by date before copying the url to Fredy, so that Fredy always captures
              the latest search results.
            </span>
          </p>
          <Dropdown
            placeholder="Select a provider"
            className="providerMutator__fields"
            selection
            value={selectedProvider == null ? '' : selectedProvider.id}
            options={provider
              .map((pro) => {
                return {
                  key: pro.id,
                  value: pro.id,
                  text: pro.name,
                };
              })
              //filter out those, that have already been selected
              .filter((option) => selected.find((selectedOption) => selectedOption.id === option.key) == null)
              .sort(sortProvider)}
            onChange={(e, { value }) => {
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
        </Modal.Description>
      </Modal.Content>
      <Modal.Actions>
        <Button color="black" onClick={() => onSubmit(false)}>
          Cancel
        </Button>
        <Button content="Save" labelPosition="right" icon="checkmark" onClick={() => onSubmit(true)} positive />
      </Modal.Actions>
    </Modal>
  );
}
