import React, { useState } from 'react';

import { transform } from '../../../../../services/transformer/notificationAdapterTransformer';
import { Modal, Form, Button, Dropdown, Input, Message } from 'semantic-ui-react';
import { xhrPost } from '../../../../../services/xhr';
import Help from './NotificationHelpDisplay';
import { useSelector } from 'react-redux';
import Switch from 'react-switch';

import './NotificationAdapterMutator.less';

const sortAdapter = (a, b) => {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
};

const validate = (selectedAdapter) => {
  const results = [];
  for (let uiElement of Object.values(selectedAdapter.fields || [])) {
    if (uiElement.value == null) {
      results.push('All fields are mandatory and must be set.');
      continue;
    }
    if (uiElement.type === 'number' && (typeof uiElement.value !== 'number' || uiElement.value < 0)) {
      results.push('A number field cannot contain anything else and must be > 0.');
      continue;
    }
    if (uiElement.type === 'boolean' && typeof uiElement.value !== 'boolean') {
      results.push('A boolean field cannot be of a different type.');
      continue;
    }
    if (typeof uiElement.value === 'string' && uiElement.value.length === 0) {
      results.push('All fields are mandatory and must be set.');
    }
  }

  return [...new Set(results)];
};

function spreadPrefilledAdapterWithValues(prefilled, fields) {
  if (prefilled != null && fields != null) {
    Object.keys(fields).forEach((fieldKey) => {
      prefilled.fields[fieldKey].value = fields[fieldKey];
    });
  }
}

export default function NotificationAdapterMutator({
  onVisibilityChanged,
  visible = false,
  selected = [],
  editNotificationAdapter,
  onData,
} = {}) {
  const adapter = useSelector((state) => state.notificationAdapter);

  const preFilledSelectedAdapter =
    editNotificationAdapter == null ? null : adapter.find((a) => a.id === editNotificationAdapter.id);

  spreadPrefilledAdapterWithValues(preFilledSelectedAdapter, editNotificationAdapter?.fields);

  const [selectedAdapter, setSelectedAdapter] = useState(preFilledSelectedAdapter);
  const [validationMessage, setValidationMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const onSubmit = (doStore) => {
    if (doStore) {
      const validationResults = validate(selectedAdapter);
      if (validationResults.length > 0) {
        setValidationMessage(validationResults.join('<br/>'));
        return;
      }

      onData(
        transform({
          id: selectedAdapter.id,
          name: selectedAdapter.name,
          fields: selectedAdapter.fields || {},
        })
      );

      setSelectedAdapter(null);
      onVisibilityChanged(false);
    } else {
      setSelectedAdapter(null);
      onVisibilityChanged(false);
    }
  };

  const onTry = () => {
    setValidationMessage(null);
    setSuccessMessage(null);

    const validationResults = validate(selectedAdapter);
    if (validationResults.length > 0) {
      setValidationMessage(validationResults.join('<br/>'));
      return;
    }

    xhrPost('/api/jobs/notificationAdapter/try', {
      id: selectedAdapter.id,
      fields: {
        ...selectedAdapter.fields,
      },
    })
      .then(() => {
        setSuccessMessage('It seems like it worked! Please check your service.');
      })
      .catch((error) =>
        setValidationMessage(`This did not work :-( I've received the following error: ${error.json.message}`)
      );
  };

  const setValue = (selectedAdapter, uiElement, key, value) => {
    uiElement.value = value;

    setSelectedAdapter({
      ...selectedAdapter,
      fields: {
        ...selectedAdapter.fields,
        [key]: {
          ...selectedAdapter.fields[key],
          value,
        },
      },
    });
  };

  const getFieldsFor = (selectedAdapter_) => {
    const selectedAdapter = Object.assign({}, selectedAdapter_);

    return Object.keys(selectedAdapter.fields || []).map((key) => {
      const uiElement = selectedAdapter.fields[key];

      return (
        <Form.Field key={uiElement.description}>
          <label>{uiElement.label}:</label>
          {uiElement.type === 'boolean' ? (
            <Switch
              checked={uiElement.value || false}
              onChange={(checked) => {
                setValue(selectedAdapter, uiElement, key, checked);
              }}
            />
          ) : (
            <Input
              type={uiElement.type}
              value={uiElement.value || ''}
              placeholder={uiElement.label}
              onChange={(e) => {
                setValue(selectedAdapter, uiElement, key, e.target.value);
              }}
            />
          )}
        </Form.Field>
      );
    });
  };

  return (
    <Modal
      onClose={() => onVisibilityChanged(false)}
      onOpen={() => onVisibilityChanged(true)}
      open={visible}
      style={{ width: '95%' }}
    >
      <Modal.Header>Adding a new Notification Adapter</Modal.Header>
      <Modal.Content image>
        <Modal.Description>
          {validationMessage != null && (
            <Message negative>
              <Message.Header>Houston we have a problem...</Message.Header>
              <p dangerouslySetInnerHTML={{ __html: validationMessage }} />
            </Message>
          )}
          {successMessage != null && (
            <Message positive>
              <Message.Header>Yay!</Message.Header>
              <p dangerouslySetInnerHTML={{ __html: successMessage }} />
            </Message>
          )}

          <p>
            When Fredy found new listings, we like to report them to you. To do so, notification adapter can be
            configured. <br />
            There are multiple ways how Fredy can send new listings to you. Chose your weapon...
          </p>
          <Dropdown
            placeholder="Select a notification adapter"
            className="providerMutator__fields"
            selection
            value={selectedAdapter == null ? '' : selectedAdapter.id}
            options={adapter
              .map((a) => {
                return {
                  key: a.id,
                  value: a.id,
                  text: a.name,
                };
              })
              //filter out those, that have already been selected
              .filter((option) =>
                editNotificationAdapter != null
                  ? true
                  : selected.find((selectedOption) => selectedOption.id === option.key) == null
              )
              .sort(sortAdapter)}
            onChange={(e, { value }) => {
              setSuccessMessage(null);
              setValidationMessage(null);
              const selectedAdapter = adapter.find((a) => a.id === value);
              setSelectedAdapter(Object.assign({}, selectedAdapter));
            }}
          />
          <br />
          <br />
          {selectedAdapter != null && (
            <Form>
              <i>{selectedAdapter.description}</i>
              <br />
              {selectedAdapter.readme != null && (
                <React.Fragment>
                  <Help readme={selectedAdapter.readme} />
                </React.Fragment>
              )}
              <br />
              {getFieldsFor(selectedAdapter)}
            </Form>
          )}
        </Modal.Description>
      </Modal.Content>
      <Modal.Actions>
        <Button
          content="Try Notification Adapter"
          labelPosition="left"
          floated="left"
          icon="hand spock"
          onClick={() => onTry()}
          color="teal"
        />
        <Button color="black" onClick={() => onSubmit(false)}>
          Cancel
        </Button>
        <Button content="Save" labelPosition="right" icon="checkmark" onClick={() => onSubmit(true)} positive />
      </Modal.Actions>
    </Modal>
  );
}
