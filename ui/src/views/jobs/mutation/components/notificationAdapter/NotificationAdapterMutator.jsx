import React, { useState } from 'react';

import { transform } from '../../../../../services/transformer/notificationAdapterTransformer';
import { xhrPost } from '../../../../../services/xhr';
import Help from './NotificationHelpDisplay';
import { useSelector } from 'react-redux';
import { Banner, Button, Form, Modal, Select, Switch } from '@douyinfe/semi-ui';

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
    if (uiElement.type === 'number') {
      const numberValue = parseFloat(uiElement.value);
      if (isNaN(numberValue) || numberValue < 0) {
        results.push('A number field cannot contain anything else and must be > 0.');
        continue;
      }
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
        }),
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
        setValidationMessage(`This did not work :-( I've received the following error: ${error.json.message}`),
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
        <Form key={key}>
          {uiElement.type === 'boolean' ? (
            <Switch
              checked={uiElement.value || false}
              onChange={(checked) => {
                setValue(selectedAdapter, uiElement, key, checked);
              }}
            />
          ) : (
            <Form.Input
              style={{ width: '100%' }}
              field={uiElement.label}
              type={uiElement.type}
              value={uiElement.value || ''}
              placeholder={uiElement.label}
              label={uiElement.label}
              onChange={(value) => {
                setValue(selectedAdapter, uiElement, key, value);
              }}
            />
          )}
        </Form>
      );
    });
  };

  return (
    <Modal
      title="Adding a new Notification Adapter"
      visible={visible}
      style={{ width: '95%' }}
      footer={
        <div>
          <Button type="secondary" disabled={selectedAdapter == null} style={{ float: 'left' }} onClick={() => onTry()}>
            Try
          </Button>
          <Button type="danger" onClick={() => onSubmit(true)}>
            Save
          </Button>
          <Button type="primary" onClick={() => onSubmit(false)}>
            Cancel
          </Button>
        </div>
      }
    >
      {validationMessage != null && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Error</div>}
          style={{ marginBottom: '1rem' }}
          description={<p dangerouslySetInnerHTML={{ __html: validationMessage }} />}
        />
      )}
      {successMessage != null && (
        <Banner
          fullMode={false}
          type="success"
          closeIcon={null}
          title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Yay!</div>}
          style={{ marginBottom: '1rem' }}
          description={<p dangerouslySetInnerHTML={{ __html: successMessage }} />}
        />
      )}

      <p>
        When Fredy found new listings, we like to report them to you. To do so, notification adapter can be configured.{' '}
        <br />
        There are multiple ways how Fredy can send new listings to you. Chose your weapon...
      </p>

      <Select
        filter
        placeholder="Select a notification adapter"
        className="providerMutator__fields"
        value={selectedAdapter == null ? '' : selectedAdapter.id}
        optionList={adapter
          .map((a) => {
            return {
              otherKey: a.id,
              value: a.id,
              label: a.name,
            };
          })
          //filter out those, that have already been selected
          .filter((option) =>
            editNotificationAdapter != null
              ? true
              : selected.find((selectedOption) => selectedOption.id === option.key) == null,
          )
          .sort(sortAdapter)}
        onChange={(value) => {
          setSuccessMessage(null);
          setValidationMessage(null);
          const selectedAdapter = adapter.find((a) => a.id === value);
          setSelectedAdapter(Object.assign({}, selectedAdapter));
        }}
      />
      <br />
      <br />
      {selectedAdapter != null && (
        <>
          <i>{selectedAdapter.description}</i>
          <br />
          <br />
          {selectedAdapter.readme != null && <Help readme={selectedAdapter.readme} />}
          <br />
          {getFieldsFor(selectedAdapter)}
        </>
      )}
    </Modal>
  );
}
