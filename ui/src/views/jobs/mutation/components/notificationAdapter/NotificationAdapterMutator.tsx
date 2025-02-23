// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import React, { useState } from 'react';

import { transform } from '../../../../../services/transformer/notificationAdapterTransformer';
import { xhrPost } from '../../../../../services/xhr';
// @ts-expect-error TS(6142): Module './NotificationHelpDisplay' was resolved to... Remove this comment to see the full error message
import Help from './NotificationHelpDisplay';
import { useSelector } from 'react-redux';
import { Banner, Button, Form, Modal, Select, Switch } from '@douyinfe/semi-ui';

import './NotificationAdapterMutator.less';

const sortAdapter = (a: any, b: any) => {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
};

const validate = (selectedAdapter: any) => {
  const results = [];
  for (let uiElement of Object.values(selectedAdapter.fields || [])) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (uiElement.value == null) {
      results.push('All fields are mandatory and must be set.');
      continue;
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (uiElement.type === 'number') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const numberValue = parseFloat(uiElement.value);
      if(isNaN(numberValue) || numberValue < 0) {
        results.push('A number field cannot contain anything else and must be > 0.');
        continue;
      }
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (uiElement.type === 'boolean' && typeof uiElement.value !== 'boolean') {
      results.push('A boolean field cannot be of a different type.');
      continue;
    }
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (typeof uiElement.value === 'string' && uiElement.value.length === 0) {
      results.push('All fields are mandatory and must be set.');
    }
  }

  return [...new Set(results)];
};

function spreadPrefilledAdapterWithValues(prefilled: any, fields: any) {
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
  onData
}: any = {}) {
  // @ts-expect-error TS(2571): Object is of type 'unknown'.
  const adapter = useSelector((state) => state.notificationAdapter);

  const preFilledSelectedAdapter =
    editNotificationAdapter == null ? null : adapter.find((a: any) => a.id === editNotificationAdapter.id);

  spreadPrefilledAdapterWithValues(preFilledSelectedAdapter, editNotificationAdapter?.fields);

  const [selectedAdapter, setSelectedAdapter] = useState(preFilledSelectedAdapter);
  const [validationMessage, setValidationMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const onSubmit = (doStore: any) => {
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

  const setValue = (selectedAdapter: any, uiElement: any, key: any, value: any) => {
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

  const getFieldsFor = (selectedAdapter_: any) => {
    const selectedAdapter = Object.assign({}, selectedAdapter_);

    return Object.keys(selectedAdapter.fields || []).map((key) => {
      const uiElement = selectedAdapter.fields[key];

      return (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Form key={key}>
          {uiElement.type === 'boolean' ? (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Switch
              checked={uiElement.value || false}
              onChange={(checked) => {
                setValue(selectedAdapter, uiElement, key, checked);
              }}
            />
          ) : (
            // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
            <Form.Input
              style={{ width: '100%' }}
              field={uiElement.label}
              type={uiElement.type}
              value={uiElement.value || ''}
              placeholder={uiElement.label}
              label={uiElement.label}
              onChange={(value: any) => {
                setValue(selectedAdapter, uiElement, key, value);
              }}
            />
          )}
        </Form>
      );
    });
  };

  return (
    // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
    <Modal
      title="Adding a new Notification Adapter"
      visible={visible}
      style={{ width: '95%' }}
      footer={
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <div>
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Button type="secondary" disabled={selectedAdapter == null} style={{ float: 'left' }} onClick={() => onTry()}>
            Try
          </Button>
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Button type="danger" onClick={() => onSubmit(true)}>
            Save
          </Button>
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          <Button type="primary" onClick={() => onSubmit(false)}>
            Cancel
          </Button>
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        </div>
      }
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
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          description={<p dangerouslySetInnerHTML={{ __html: validationMessage }} />}
        />
      )}
      {successMessage != null && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <Banner
          fullMode={false}
          type="success"
          closeIcon={null}
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          title={<div style={{ fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Yay!</div>}
          style={{ marginBottom: '1rem' }}
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          description={<p dangerouslySetInnerHTML={{ __html: successMessage }} />}
        />
      )}

      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <p>
        When Fredy found new listings, we like to report them to you. To do so, notification adapter can be configured.{' '}
        // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
        <br />
        There are multiple ways how Fredy can send new listings to you. Chose your weapon...
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      </p>

      // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
      <Select
        filter
        placeholder="Select a notification adapter"
        className="providerMutator__fields"
        value={selectedAdapter == null ? '' : selectedAdapter.id}
        optionList={adapter
          .map((a: any) => {
            return {
              otherKey: a.id,
              value: a.id,
              label: a.name,
            };
          })
          //filter out those, that have already been selected
          .filter((option: any) => editNotificationAdapter != null
          ? true
          // @ts-expect-error TS(7006): Parameter 'selectedOption' implicitly has an 'any'... Remove this comment to see the full error message
          : selected.find((selectedOption) => selectedOption.id === option.key) == null
          )
          .sort(sortAdapter)}
        onChange={(value: any) => {
          setSuccessMessage(null);
          setValidationMessage(null);
          const selectedAdapter = adapter.find((a: any) => a.id === value);
          setSelectedAdapter(Object.assign({}, selectedAdapter));
        }}
      />
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <br />
      // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
      <br />
      {selectedAdapter != null && (
        // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
        <>
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          <i>{selectedAdapter.description}</i>
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          <br />
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          <br />
          // @ts-expect-error TS(17004): Cannot use JSX unless the '--jsx' flag is provided... Remove this comment to see the full error message
          {selectedAdapter.readme != null && <Help readme={selectedAdapter.readme} />}
          // @ts-expect-error TS(7026): JSX element implicitly has type 'any' because no i... Remove this comment to see the full error message
          <br />
          {getFieldsFor(selectedAdapter)}
        </>
      )}
    </Modal>
  );
}
