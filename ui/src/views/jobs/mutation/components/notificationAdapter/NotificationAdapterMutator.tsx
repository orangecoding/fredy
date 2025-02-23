import React, { useState } from 'react';

import { parseError, xhrPost } from '#ui_services/xhr.ts';
import Help from './NotificationHelpDisplay';
import { useSelector } from 'react-redux';
import { Banner, Button, Form, Modal, Select, Switch } from '@douyinfe/semi-ui';

import './NotificationAdapterMutator.less';
import {
  NotificationAdapterConfig,
  NotificationAdapterFields,
  NotificationAdapterFieldsValue,
} from '#types/NotificationAdapter.ts';
import { RootState } from 'ui/src/types';
import { XhrApiResponseError } from 'ui/src/types/XhrApi';

const sortAdapterByValue = (a: { value?: string | null }, b: { value?: string | null }) => {
  if ((a.value ?? '') < (b.value ?? '')) return -1;
  if ((a.value ?? '') > (b.value ?? '')) return 1;
  return 0;
};

const validate = (selectedAdapter: NotificationAdapterConfig) => {
  const results = [];
  for (const uiElement of Object.values(selectedAdapter.fields || [])) {
    if (uiElement.value == null) {
      results.push('All fields are mandatory and must be set.');
      continue;
    }
    if (uiElement.type === 'number') {
      const numberValue = parseFloat(uiElement.value as string);
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

function spreadPrefilledAdapterWithValues(
  prefilled: NotificationAdapterConfig | null,
  fields: NotificationAdapterFields | null,
) {
  if (prefilled == null || fields == null) return;
  Object.keys(fields).forEach((fieldKey) => {
    if (fields[fieldKey].value !== undefined) {
      prefilled.fields[fieldKey].value = fields[fieldKey].value;
    }
  });
}

export default function NotificationAdapterMutator({
  onVisibilityChanged,
  visible = false,
  selected = [],
  editNotificationAdapter,
  onData,
}: {
  onVisibilityChanged?: (visible: boolean) => void;
  visible?: boolean;
  selected?: NotificationAdapterConfig[];
  editNotificationAdapter?: NotificationAdapterConfig | undefined;
  onData?: (data: NotificationAdapterConfig) => void;
} = {}) {
  const adapter = useSelector((state: RootState) => state.notificationAdapter.adapter);

  const preFilledSelectedAdapter =
    adapter.find((a: NotificationAdapterConfig) => a.id === editNotificationAdapter?.id) ?? null;

  spreadPrefilledAdapterWithValues(preFilledSelectedAdapter, editNotificationAdapter?.fields ?? {});

  const [selectedAdapter, setSelectedAdapter] = useState<NotificationAdapterConfig | null>(preFilledSelectedAdapter);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const onSubmit = (doStore: boolean) => {
    if (doStore) {
      if (selectedAdapter == null) return;
      const validationResults = validate(selectedAdapter);
      if (validationResults.length > 0) {
        setValidationMessage(validationResults.join('<br/>'));
        return;
      }

      onData?.({
        id: selectedAdapter.id,
        name: selectedAdapter.name ?? 'N/A',
        fields: selectedAdapter.fields,
      });

      setSelectedAdapter(null);
      onVisibilityChanged?.(false);
    } else {
      setSelectedAdapter(null);
      onVisibilityChanged?.(false);
    }
  };

  const onTry = () => {
    setValidationMessage(null);
    setSuccessMessage(null);

    if (selectedAdapter == null) return;
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
      .catch((error: XhrApiResponseError | Error) =>
        setValidationMessage(`This did not work :-( I've received the following error: ${parseError(error)}`),
      );
  };

  const setValue = (
    selectedAdapter: NotificationAdapterConfig,
    uiElement: NotificationAdapterFieldsValue,
    key: string,
    value: string | boolean | number,
  ) => {
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

  const getFieldsFor = (selectedAdapter_: NotificationAdapterConfig) => {
    const selectedAdapter = Object.assign({}, selectedAdapter_);

    return Object.keys(selectedAdapter.fields || []).map((key) => {
      const uiElement = selectedAdapter.fields[key];

      return (
        <Form key={key}>
          {uiElement.type === 'boolean' ? (
            <Switch
              checked={(uiElement.value as boolean) || false}
              onChange={(checked) => {
                setValue(selectedAdapter, uiElement, key, checked);
              }}
            />
          ) : (
            <Form.Input
              style={{ width: '100%' }}
              field={uiElement.label}
              type={uiElement.type}
              initValue={uiElement.value || ''}
              placeholder={uiElement.label}
              label={uiElement.label}
              onChange={(value: string) => {
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
      onCancel={() => onSubmit(false)}
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
          // eslint-disable-next-line react/no-danger
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
          // eslint-disable-next-line react/no-danger
          description={<p dangerouslySetInnerHTML={{ __html: successMessage }} />}
        />
      )}
      <p>
        When Fredy found new listings, we like to report them to you. To do so, notification adapter can be configured.
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
              value: a.id,
              label: a.name,
            };
          })
          //filter out those, that have already been selected
          .filter((option) =>
            editNotificationAdapter != null
              ? true
              : selected.find((selectedOption) => selectedOption.id === option.value) == null,
          )
          .sort(sortAdapterByValue)}
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
