/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useState, useEffect } from 'react';

import { Banner, Modal, Select, Input } from '@douyinfe/semi-ui-19';
import { IconExternalOpen } from '@douyinfe/semi-icons';
import { transform } from '../../../../../services/transformer/providerTransformer';
import { useSelector } from '../../../../../services/state/store';
import { validateProviderUrl } from '../../../../../services/jobs/providerUrl.js';
import { labelWithFlags } from '../../../../../services/countryFlags.js';
import { sortProviders } from '../../../../../services/providerOrder.js';

import './ProviderMutator.less';
import { useScreenWidth } from '../../../../../hooks/screenWidth.js';
import { useTranslation } from '../../../../../services/i18n/i18n.jsx';

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
  const t = useTranslation();
  const provider = useSelector((state) => state.provider);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerUrl, setProviderUrl] = useState('');
  const [validationMessage, setValidationMessage] = useState(null);

  useEffect(() => {
    // The message is cleared along with the fields. It used to be left behind, so tripping the
    // error once meant a stale red banner greeted the next "Add new Provider".
    setValidationMessage(null);
    if (providerToEdit) {
      setSelectedProvider(returnOriginalSelectedProvider(providerToEdit, provider));
      setProviderUrl(providerToEdit.url ?? '');
    } else {
      setSelectedProvider(null);
      setProviderUrl('');
    }
  }, [providerToEdit, visible]);

  const width = useScreenWidth();
  const isMobile = width <= 850;

  /**
   * Why the pasted URL cannot be used, in words the user can act on, and at which field.
   *
   * The three URL problems belong under the URL field - they are all statements about the thing
   * that was pasted. The fourth case is "nothing chosen at all", which is not about either field
   * in particular and stays a notice above both.
   *
   * @returns {{ where: 'url'|'form', message: string }|null}
   */
  const validate = () => {
    const { ok, problem, expectedHost } = validateProviderUrl(providerUrl, selectedProvider);
    if (ok) {
      return null;
    }
    switch (problem) {
      case 'bareHost':
        return { where: 'url', message: t('provider.validationBareHost', { host: expectedHost }) };
      case 'wrongHost':
        return { where: 'url', message: t('provider.validationWrongHost', { host: expectedHost }) };
      case 'unparsable':
        return { where: 'url', message: t('provider.validationUnparsable') };
      default:
        return { where: 'form', message: t('provider.validationSelectAndUrl') };
    }
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
        setProviderUrl('');
        setSelectedProvider(null);
        setValidationMessage(null);
        onVisibilityChanged(false);
      } else {
        setValidationMessage(validationResult);
      }
    } else {
      setProviderUrl('');
      setSelectedProvider(null);
      setValidationMessage(null);
      onVisibilityChanged(false);
    }
  };

  return (
    <Modal
      title={providerToEdit ? t('provider.editTitle') : t('provider.defaultTitle')}
      visible={visible}
      onOk={() => onSubmit(true)}
      onCancel={() => onSubmit(false)}
      // Three short lines and two fields do not need half a screen. It was 50rem, which left the
      // controls stranded in the left third of an otherwise empty dialog.
      style={{ width: isMobile ? '95%' : '34rem' }}
      okText={providerToEdit ? t('provider.save') : t('provider.addAction')}
    >
      {validationMessage?.where === 'form' && (
        <Banner
          fullMode={false}
          type="danger"
          closeIcon={null}
          className="providerMutator__banner"
          description={validationMessage.message}
        />
      )}

      {providerToEdit != null ? (
        <p className="providerMutator__editNote">{t('provider.editDescription', { name: providerToEdit.name })}</p>
      ) : null}

      {/* Two numbered steps, each holding the field it describes. They used to be three sentences
          of grey prose above three controls that did not correspond to them: step one said
          "choose below", step three said "paste it here" and meant a field two rows further
          down. */}
      <ol className="providerMutator__steps">
        <li className="providerMutator__step">
          <span className="providerMutator__stepTitle">{t('provider.stepChooseTitle')}</span>
          <Select
            filter
            placeholder={t('provider.selectPlaceholder')}
            className="providerMutator__fields"
            dropdownClassName="providerMutator__dropdown"
            disabled={providerToEdit != null}
            // Sorted by country and then by size, rather than by name: somebody searching in Vienna
            // should not have to read past every German provider, and the one most people want
            // should not sit halfway down the list because of its initial.
            optionList={sortProviders(provider).map((pro) => {
              return {
                otherKey: pro.id,
                value: pro.id,
                // The flags come from what the provider declared it covers, so one serving two
                // countries shows both. Only the label carries them - the name stored on the job
                // stays the plain one.
                label: labelWithFlags(pro),
              };
            })}
            value={selectedProvider == null ? '' : selectedProvider.id}
            onChange={(value) => {
              setSelectedProvider(provider.find((pro) => pro.id === value));
              setValidationMessage(null);
            }}
          />

          {/* The row is reserved whether or not a provider has been picked. It used to appear on
              selection and push the URL field down under the cursor that had just clicked.

              A link the user clicks, rather than a `window.open()` fired from the Select's
              onChange. That opened a tab before they had read a word of the instructions, opened a
              second one if they changed their mind, and was swallowed without a trace by a popup
              blocker. */}
          <span className="providerMutator__openRow">
            {selectedProvider != null && (
              <a
                className="providerMutator__openLink"
                href={selectedProvider.baseUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <IconExternalOpen />
                {t('provider.openInNewTab', { name: selectedProvider.name })}
              </a>
            )}
          </span>

          <span className="providerMutator__stepHint">{t('provider.stepChooseHint')}</span>
        </li>

        <li className="providerMutator__step">
          <span className="providerMutator__stepTitle">{t('provider.stepPasteTitle')}</span>
          <Input
            type="text"
            placeholder={t('provider.urlPlaceholder')}
            className="providerMutator__fields"
            validateStatus={validationMessage?.where === 'url' ? 'error' : 'default'}
            value={providerUrl}
            onChange={(value) => {
              setProviderUrl(value);
              setValidationMessage(null);
            }}
          />
          {validationMessage?.where === 'url' && (
            <span className="providerMutator__error">{validationMessage.message}</span>
          )}
        </li>
      </ol>
    </Modal>
  );
}
